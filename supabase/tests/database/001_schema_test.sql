-- Schema Tests
-- Verifies that all tables, indexes, and constraints are created correctly

-- Test helper to assert conditions
CREATE OR REPLACE FUNCTION assert_true(condition boolean, message text)
RETURNS void AS $$
BEGIN
    IF NOT condition THEN
        RAISE EXCEPTION 'Assertion failed: %', message;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Test helper to assert table exists
CREATE OR REPLACE FUNCTION assert_table_exists(table_name text)
RETURNS void AS $$
BEGIN
    PERFORM assert_true(
        EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = assert_table_exists.table_name
        ),
        format('Table %s should exist', table_name)
    );
END;
$$ LANGUAGE plpgsql;

-- Test helper to assert column exists
CREATE OR REPLACE FUNCTION assert_column_exists(table_name text, column_name text)
RETURNS void AS $$
BEGIN
    PERFORM assert_true(
        EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
                AND table_name = assert_column_exists.table_name
                AND column_name = assert_column_exists.column_name
        ),
        format('Column %s.%s should exist', table_name, column_name)
    );
END;
$$ LANGUAGE plpgsql;

-- Test helper to assert index exists
CREATE OR REPLACE FUNCTION assert_index_exists(index_name text)
RETURNS void AS $$
BEGIN
    PERFORM assert_true(
        EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public' AND indexname = index_name
        ),
        format('Index %s should exist', index_name)
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLE EXISTENCE TESTS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Testing table existence...';

    PERFORM assert_table_exists('profiles');
    PERFORM assert_table_exists('folders');
    PERFORM assert_table_exists('documents');
    PERFORM assert_table_exists('patches');
    PERFORM assert_table_exists('typed_content');
    PERFORM assert_table_exists('corrections');
    PERFORM assert_table_exists('spans');
    PERFORM assert_table_exists('annotations');

    RAISE NOTICE 'All tables exist ✓';
END $$;

-- ============================================================================
-- COLUMN TESTS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Testing column existence...';

    -- Profiles columns
    PERFORM assert_column_exists('profiles', 'id');
    PERFORM assert_column_exists('profiles', 'display_name');
    PERFORM assert_column_exists('profiles', 'preferences');

    -- Patches columns (including new embedding column)
    PERFORM assert_column_exists('patches', 'id');
    PERFORM assert_column_exists('patches', 'user_id');
    PERFORM assert_column_exists('patches', 'status');
    PERFORM assert_column_exists('patches', 'image_path');
    PERFORM assert_column_exists('patches', 'original_filename');
    PERFORM assert_column_exists('patches', 'import_batch_id');
    PERFORM assert_column_exists('patches', 'extracted_text');
    PERFORM assert_column_exists('patches', 'embedding');
    PERFORM assert_column_exists('patches', 'confidence_data');
    PERFORM assert_column_exists('patches', 'suggested_action');

    -- Typed content columns
    PERFORM assert_column_exists('typed_content', 'id');
    PERFORM assert_column_exists('typed_content', 'content');
    PERFORM assert_column_exists('typed_content', 'embedding');

    -- Spans columns
    PERFORM assert_column_exists('spans', 'id');
    PERFORM assert_column_exists('spans', 'document_id');
    PERFORM assert_column_exists('spans', 'source_type');
    PERFORM assert_column_exists('spans', 'source_id');
    PERFORM assert_column_exists('spans', 'source_start');
    PERFORM assert_column_exists('spans', 'source_end');
    PERFORM assert_column_exists('spans', 'position');
    PERFORM assert_column_exists('spans', 'version_added');
    PERFORM assert_column_exists('spans', 'version_removed');

    -- Documents columns
    PERFORM assert_column_exists('documents', 'current_version');
    PERFORM assert_column_exists('documents', 'updated_at');

    RAISE NOTICE 'All columns exist ✓';
END $$;

-- ============================================================================
-- INDEX TESTS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Testing index existence...';

    PERFORM assert_index_exists('patches_user_id_idx');
    PERFORM assert_index_exists('patches_status_idx');
    PERFORM assert_index_exists('patches_embedding_idx');
    PERFORM assert_index_exists('documents_user_id_idx');
    PERFORM assert_index_exists('spans_document_id_idx');
    PERFORM assert_index_exists('spans_active_idx');
    PERFORM assert_index_exists('typed_content_embedding_idx');

    RAISE NOTICE 'All indexes exist ✓';
END $$;

-- ============================================================================
-- CONSTRAINT TESTS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Testing constraints...';

    -- Test patches status constraint
    BEGIN
        INSERT INTO patches (user_id, image_path, extracted_text, status)
        VALUES ('00000000-0000-0000-0000-000000000000', 'test.jpg', 'test', 'invalid_status');
        RAISE EXCEPTION 'Should have rejected invalid status';
    EXCEPTION WHEN check_violation THEN
        -- Expected
        NULL;
    END;

    -- Test spans source_type constraint
    BEGIN
        INSERT INTO spans (document_id, source_type, source_id, source_start, source_end, position, version_added)
        VALUES ('00000000-0000-0000-0000-000000000000', 'invalid', '00000000-0000-0000-0000-000000000000', 0, 10, 'a', 1);
        RAISE EXCEPTION 'Should have rejected invalid source_type';
    EXCEPTION WHEN check_violation THEN
        -- Expected
        NULL;
    END;

    -- Test annotations source constraint
    BEGIN
        INSERT INTO annotations (user_id, source, content, status)
        VALUES ('00000000-0000-0000-0000-000000000000', 'invalid', 'test', 'pending');
        RAISE EXCEPTION 'Should have rejected invalid source';
    EXCEPTION WHEN check_violation THEN
        -- Expected
        NULL;
    END;

    RAISE NOTICE 'All constraints working ✓';
END $$;

-- ============================================================================
-- RLS TESTS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Testing RLS is enabled...';

    PERFORM assert_true(
        (SELECT relrowsecurity FROM pg_class WHERE relname = 'profiles'),
        'RLS should be enabled on profiles'
    );
    PERFORM assert_true(
        (SELECT relrowsecurity FROM pg_class WHERE relname = 'folders'),
        'RLS should be enabled on folders'
    );
    PERFORM assert_true(
        (SELECT relrowsecurity FROM pg_class WHERE relname = 'documents'),
        'RLS should be enabled on documents'
    );
    PERFORM assert_true(
        (SELECT relrowsecurity FROM pg_class WHERE relname = 'patches'),
        'RLS should be enabled on patches'
    );
    PERFORM assert_true(
        (SELECT relrowsecurity FROM pg_class WHERE relname = 'spans'),
        'RLS should be enabled on spans'
    );
    PERFORM assert_true(
        (SELECT relrowsecurity FROM pg_class WHERE relname = 'annotations'),
        'RLS should be enabled on annotations'
    );

    RAISE NOTICE 'RLS enabled on all tables ✓';
END $$;

-- ============================================================================
-- EXTENSION TESTS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Testing extensions...';

    PERFORM assert_true(
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector'),
        'pgvector extension should be installed'
    );
    PERFORM assert_true(
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'),
        'uuid-ossp extension should be installed'
    );

    RAISE NOTICE 'All extensions installed ✓';
END $$;

-- Clean up test functions
DROP FUNCTION IF EXISTS assert_true(boolean, text);
DROP FUNCTION IF EXISTS assert_table_exists(text);
DROP FUNCTION IF EXISTS assert_column_exists(text, text);
DROP FUNCTION IF EXISTS assert_index_exists(text);

RAISE NOTICE '=== All schema tests passed ===';
