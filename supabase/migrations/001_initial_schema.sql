-- Patchwork Initial Schema
-- Creates all tables, indexes, RLS policies, and storage buckets

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- PROFILES
-- ============================================================================

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- FOLDERS
-- ============================================================================

CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position TEXT NOT NULL DEFAULT 'a',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX folders_user_id_idx ON folders(user_id);
CREATE INDEX folders_parent_id_idx ON folders(parent_id);

-- ============================================================================
-- DOCUMENTS
-- ============================================================================

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX documents_user_id_idx ON documents(user_id);
CREATE INDEX documents_folder_id_idx ON documents(folder_id);
CREATE INDEX documents_updated_at_idx ON documents(user_id, updated_at DESC);

-- ============================================================================
-- PATCHES
-- ============================================================================

CREATE TABLE patches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'inbox'
        CHECK (status IN ('inbox', 'review', 'ready', 'applied', 'discarded')),
    image_path TEXT NOT NULL,
    original_filename TEXT,
    import_batch_id UUID,
    extracted_text TEXT NOT NULL,
    embedding VECTOR(1536),
    confidence_data JSONB DEFAULT '{}'::jsonb,
    suggested_action JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ
);

CREATE INDEX patches_user_id_idx ON patches(user_id);
CREATE INDEX patches_status_idx ON patches(user_id, status);
CREATE INDEX patches_import_batch_idx ON patches(import_batch_id);
CREATE INDEX patches_imported_at_idx ON patches(user_id, imported_at DESC);

-- Vector similarity search index (IVFFlat for performance)
-- Note: Run this after inserting initial data for better index quality
CREATE INDEX patches_embedding_idx ON patches
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ============================================================================
-- TYPED CONTENT
-- ============================================================================

CREATE TABLE typed_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX typed_content_user_id_idx ON typed_content(user_id);

-- Vector similarity search index for typed content
CREATE INDEX typed_content_embedding_idx ON typed_content
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ============================================================================
-- CORRECTIONS
-- ============================================================================

CREATE TABLE corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    original TEXT NOT NULL,
    corrected TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    auto_apply BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, original, corrected)
);

CREATE INDEX corrections_user_id_idx ON corrections(user_id);
CREATE INDEX corrections_lookup_idx ON corrections(user_id, original);

-- ============================================================================
-- SPANS
-- ============================================================================

CREATE TABLE spans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('patch', 'typed')),
    source_id UUID NOT NULL,
    source_start INTEGER NOT NULL,
    source_end INTEGER NOT NULL,
    position TEXT NOT NULL,
    version_added INTEGER NOT NULL,
    version_removed INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX spans_document_id_idx ON spans(document_id);
CREATE INDEX spans_source_idx ON spans(source_type, source_id);
CREATE INDEX spans_active_idx ON spans(document_id) WHERE version_removed IS NULL;
CREATE INDEX spans_version_idx ON spans(document_id, version_added, version_removed);

-- ============================================================================
-- ANNOTATIONS
-- ============================================================================

CREATE TABLE annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('detected', 'manual')),
    patch_id UUID REFERENCES patches(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    anchor_start INTEGER,
    anchor_end INTEGER,
    content TEXT NOT NULL,
    interpretation TEXT CHECK (interpretation IN ('expand', 'cut', 'move', 'question', 'note', 'unknown')),
    image_region JSONB,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'dismissed', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX annotations_user_id_idx ON annotations(user_id);
CREATE INDEX annotations_patch_id_idx ON annotations(patch_id);
CREATE INDEX annotations_document_id_idx ON annotations(document_id);
CREATE INDEX annotations_status_idx ON annotations(user_id, status);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE patches ENABLE ROW LEVEL SECURITY;
ALTER TABLE typed_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only access their own profile
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Folders: users can only access their own folders
CREATE POLICY "Users can view own folders"
    ON folders FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own folders"
    ON folders FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own folders"
    ON folders FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own folders"
    ON folders FOR DELETE
    USING (auth.uid() = user_id);

-- Documents: users can only access their own documents
CREATE POLICY "Users can view own documents"
    ON documents FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own documents"
    ON documents FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
    ON documents FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
    ON documents FOR DELETE
    USING (auth.uid() = user_id);

-- Patches: users can only access their own patches
CREATE POLICY "Users can view own patches"
    ON patches FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own patches"
    ON patches FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own patches"
    ON patches FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own patches"
    ON patches FOR DELETE
    USING (auth.uid() = user_id);

-- Typed content: users can only access their own
CREATE POLICY "Users can view own typed content"
    ON typed_content FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own typed content"
    ON typed_content FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own typed content"
    ON typed_content FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own typed content"
    ON typed_content FOR DELETE
    USING (auth.uid() = user_id);

-- Corrections: users can only access their own
CREATE POLICY "Users can view own corrections"
    ON corrections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own corrections"
    ON corrections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own corrections"
    ON corrections FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own corrections"
    ON corrections FOR DELETE
    USING (auth.uid() = user_id);

-- Spans: access via document ownership
CREATE POLICY "Users can view spans of own documents"
    ON spans FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM documents
            WHERE documents.id = spans.document_id
            AND documents.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create spans in own documents"
    ON spans FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM documents
            WHERE documents.id = spans.document_id
            AND documents.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update spans in own documents"
    ON spans FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM documents
            WHERE documents.id = spans.document_id
            AND documents.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete spans in own documents"
    ON spans FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM documents
            WHERE documents.id = spans.document_id
            AND documents.user_id = auth.uid()
        )
    );

-- Annotations: users can only access their own
CREATE POLICY "Users can view own annotations"
    ON annotations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own annotations"
    ON annotations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own annotations"
    ON annotations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own annotations"
    ON annotations FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- STORAGE
-- ============================================================================

-- Create storage bucket for patch images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'patches',
    'patches',
    FALSE,
    52428800, -- 50MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
);

-- Storage policies
CREATE POLICY "Users can upload own patch images"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'patches'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view own patch images"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'patches'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete own patch images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'patches'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get document content at a specific version
CREATE OR REPLACE FUNCTION get_document_content(
    doc_id UUID,
    version INTEGER DEFAULT NULL
)
RETURNS TABLE (
    span_id UUID,
    source_type TEXT,
    source_id UUID,
    source_start INTEGER,
    source_end INTEGER,
    span_position TEXT,
    content TEXT
) AS $$
DECLARE
    v INTEGER;
BEGIN
    -- Use current version if not specified
    IF version IS NULL THEN
        SELECT current_version INTO v FROM documents WHERE id = doc_id;
    ELSE
        v := version;
    END IF;

    RETURN QUERY
    SELECT
        s.id AS span_id,
        s.source_type,
        s.source_id,
        s.source_start,
        s.source_end,
        s."position" AS span_position,
        CASE
            WHEN s.source_type = 'patch' THEN
                SUBSTRING(p.extracted_text FROM s.source_start + 1 FOR s.source_end - s.source_start)
            WHEN s.source_type = 'typed' THEN
                SUBSTRING(tc.content FROM s.source_start + 1 FOR s.source_end - s.source_start)
        END AS content
    FROM spans s
    LEFT JOIN patches p ON s.source_type = 'patch' AND s.source_id = p.id
    LEFT JOIN typed_content tc ON s.source_type = 'typed' AND s.source_id = tc.id
    WHERE s.document_id = doc_id
        AND s.version_added <= v
        AND (s.version_removed IS NULL OR s.version_removed > v)
    ORDER BY s."position";
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find similar patches using vector search
CREATE OR REPLACE FUNCTION find_similar_patches(
    query_embedding VECTOR(1536),
    user_uuid UUID,
    exclude_patch_id UUID DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.5,
    match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    patch_id UUID,
    extracted_text TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id AS patch_id,
        p.extracted_text,
        1 - (p.embedding <=> query_embedding) AS similarity
    FROM patches p
    WHERE p.user_id = user_uuid
        AND p.embedding IS NOT NULL
        AND (exclude_patch_id IS NULL OR p.id != exclude_patch_id)
        AND 1 - (p.embedding <=> query_embedding) > match_threshold
    ORDER BY p.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to map similar patches to documents
CREATE OR REPLACE FUNCTION find_candidate_documents(
    query_embedding VECTOR(1536),
    user_uuid UUID,
    exclude_patch_id UUID DEFAULT NULL
)
RETURNS TABLE (
    document_id UUID,
    document_name TEXT,
    folder_id UUID,
    max_similarity FLOAT,
    matching_patches INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH similar_patches_cte AS (
        SELECT * FROM find_similar_patches(query_embedding, user_uuid, exclude_patch_id)
    )
    SELECT
        d.id AS document_id,
        d.name AS document_name,
        d.folder_id,
        MAX(similar_patches_cte.similarity) AS max_similarity,
        COUNT(DISTINCT similar_patches_cte.patch_id)::INTEGER AS matching_patches
    FROM similar_patches_cte
    JOIN spans s ON s.source_type = 'patch' AND s.source_id = similar_patches_cte.patch_id
    JOIN documents d ON d.id = s.document_id
    WHERE s.version_removed IS NULL  -- only active spans
    GROUP BY d.id, d.name, d.folder_id
    ORDER BY max_similarity DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment correction count (upsert)
CREATE OR REPLACE FUNCTION record_correction(
    user_uuid UUID,
    original_text TEXT,
    corrected_text TEXT
)
RETURNS corrections AS $$
DECLARE
    result corrections;
BEGIN
    INSERT INTO corrections (user_id, original, corrected, count)
    VALUES (user_uuid, original_text, corrected_text, 1)
    ON CONFLICT (user_id, original, corrected)
    DO UPDATE SET
        count = corrections.count + 1,
        updated_at = NOW()
    RETURNING * INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate fractional index between two positions
CREATE OR REPLACE FUNCTION fractional_index_between(
    before_pos TEXT,
    after_pos TEXT
)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
    i INTEGER;
    before_char INTEGER;
    after_char INTEGER;
    mid_char INTEGER;
BEGIN
    -- Handle edge cases
    IF before_pos IS NULL OR before_pos = '' THEN
        before_pos := 'A';  -- Start of range
    END IF;
    IF after_pos IS NULL OR after_pos = '' THEN
        after_pos := 'z';  -- End of range
    END IF;

    -- Find the midpoint character by character
    result := '';
    FOR i IN 1..GREATEST(LENGTH(before_pos), LENGTH(after_pos)) + 1 LOOP
        before_char := CASE
            WHEN i <= LENGTH(before_pos) THEN ASCII(SUBSTRING(before_pos FROM i FOR 1))
            ELSE 48  -- '0'
        END;
        after_char := CASE
            WHEN i <= LENGTH(after_pos) THEN ASCII(SUBSTRING(after_pos FROM i FOR 1))
            ELSE 123  -- 'z' + 1
        END;

        IF after_char - before_char > 1 THEN
            mid_char := before_char + (after_char - before_char) / 2;
            result := result || CHR(mid_char);
            EXIT;
        ELSE
            result := result || SUBSTRING(before_pos FROM i FOR 1);
        END IF;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER folders_updated_at
    BEFORE UPDATE ON folders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER corrections_updated_at
    BEFORE UPDATE ON corrections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
