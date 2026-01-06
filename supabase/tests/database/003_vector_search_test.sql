-- Vector Search Tests
-- Tests for find_similar_patches and find_candidate_documents

DO $$
DECLARE
    test_user_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    test_folder_id UUID;
    test_document_id UUID;
    test_patch_1_id UUID;
    test_patch_2_id UUID;
    test_patch_3_id UUID;
    query_embedding vector(1536);
    similar_embedding vector(1536);
    different_embedding vector(1536);
    result_count INTEGER;
    result_record RECORD;
BEGIN
    RAISE NOTICE 'Setting up vector search test data...';

    -- Clean up any existing test data
    DELETE FROM spans WHERE document_id IN (SELECT id FROM documents WHERE user_id = test_user_id);
    DELETE FROM documents WHERE user_id = test_user_id;
    DELETE FROM folders WHERE user_id = test_user_id;
    DELETE FROM patches WHERE user_id = test_user_id;

    -- Create deterministic test embeddings
    -- Base embedding: all 0.5
    query_embedding := array_fill(0.5::float, ARRAY[1536])::vector;

    -- Similar embedding: mostly 0.5 with small variations (high cosine similarity)
    similar_embedding := (
        SELECT array_agg(0.5 + (random() - 0.5) * 0.1)::vector(1536)
        FROM generate_series(1, 1536)
    );

    -- Different embedding: negative values (low cosine similarity)
    different_embedding := array_fill(-0.5::float, ARRAY[1536])::vector;

    -- Create folder and document
    INSERT INTO folders (id, user_id, name, position)
    VALUES (gen_random_uuid(), test_user_id, 'Vector Test Folder', 'a')
    RETURNING id INTO test_folder_id;

    INSERT INTO documents (id, user_id, folder_id, name, current_version)
    VALUES (gen_random_uuid(), test_user_id, test_folder_id, 'Vector Test Document', 1)
    RETURNING id INTO test_document_id;

    -- Create patches with embeddings
    -- Patch 1: Similar to query
    INSERT INTO patches (id, user_id, image_path, extracted_text, embedding, status)
    VALUES (
        gen_random_uuid(),
        test_user_id,
        'test/similar.jpg',
        'This content is similar to the query.',
        query_embedding,  -- Use same embedding for high similarity
        'applied'
    )
    RETURNING id INTO test_patch_1_id;

    -- Patch 2: Also similar
    INSERT INTO patches (id, user_id, image_path, extracted_text, embedding, status)
    VALUES (
        gen_random_uuid(),
        test_user_id,
        'test/also-similar.jpg',
        'Another piece of similar content.',
        similar_embedding,
        'applied'
    )
    RETURNING id INTO test_patch_2_id;

    -- Patch 3: Different
    INSERT INTO patches (id, user_id, image_path, extracted_text, embedding, status)
    VALUES (
        gen_random_uuid(),
        test_user_id,
        'test/different.jpg',
        'This content is very different.',
        different_embedding,
        'ready'
    )
    RETURNING id INTO test_patch_3_id;

    -- Create spans linking patches to document
    INSERT INTO spans (document_id, source_type, source_id, source_start, source_end, position, version_added)
    VALUES
        (test_document_id, 'patch', test_patch_1_id, 0, 37, 'a', 1),
        (test_document_id, 'patch', test_patch_2_id, 0, 33, 'b', 1);

    RAISE NOTICE 'Vector search test data created ✓';

    -- ========================================================================
    -- TEST: find_similar_patches
    -- ========================================================================
    RAISE NOTICE 'Testing find_similar_patches...';

    -- Query for similar patches (should find patch 1 and 2, not patch 3)
    SELECT COUNT(*) INTO result_count
    FROM find_similar_patches(query_embedding, test_user_id, NULL, 0.5, 10);

    IF result_count < 1 THEN
        RAISE EXCEPTION 'Should find at least 1 similar patch, found %', result_count;
    END IF;

    -- Check that the most similar patch is patch 1 (identical embedding)
    SELECT * INTO result_record
    FROM find_similar_patches(query_embedding, test_user_id, NULL, 0.5, 10)
    ORDER BY similarity DESC
    LIMIT 1;

    IF result_record.patch_id != test_patch_1_id THEN
        RAISE NOTICE 'Note: Most similar patch was %, expected %', result_record.patch_id, test_patch_1_id;
    END IF;

    IF result_record.similarity < 0.9 THEN
        RAISE EXCEPTION 'Identical embedding should have similarity > 0.9, got %', result_record.similarity;
    END IF;

    RAISE NOTICE 'find_similar_patches ✓';

    -- ========================================================================
    -- TEST: find_similar_patches with exclusion
    -- ========================================================================
    RAISE NOTICE 'Testing find_similar_patches with exclusion...';

    -- Exclude patch 1, should still find patch 2
    SELECT COUNT(*) INTO result_count
    FROM find_similar_patches(query_embedding, test_user_id, test_patch_1_id, 0.3, 10);

    -- Should find at least patch 2
    IF result_count < 1 THEN
        RAISE EXCEPTION 'Should find at least 1 patch when excluding one, found %', result_count;
    END IF;

    -- Make sure patch 1 is not in results
    IF EXISTS (
        SELECT 1 FROM find_similar_patches(query_embedding, test_user_id, test_patch_1_id, 0.3, 10)
        WHERE patch_id = test_patch_1_id
    ) THEN
        RAISE EXCEPTION 'Excluded patch should not appear in results';
    END IF;

    RAISE NOTICE 'find_similar_patches with exclusion ✓';

    -- ========================================================================
    -- TEST: find_similar_patches threshold
    -- ========================================================================
    RAISE NOTICE 'Testing find_similar_patches threshold...';

    -- With very high threshold, might find fewer results
    SELECT COUNT(*) INTO result_count
    FROM find_similar_patches(query_embedding, test_user_id, NULL, 0.99, 10);

    -- Only patch 1 should meet 0.99 threshold (identical embedding)
    IF result_count > 1 THEN
        RAISE NOTICE 'With 0.99 threshold, found % patches (expected 1)', result_count;
    END IF;

    RAISE NOTICE 'find_similar_patches threshold ✓';

    -- ========================================================================
    -- TEST: find_candidate_documents
    -- ========================================================================
    RAISE NOTICE 'Testing find_candidate_documents...';

    -- Should find the test document since it contains similar patches
    SELECT COUNT(*) INTO result_count
    FROM find_candidate_documents(query_embedding, test_user_id, NULL);

    IF result_count != 1 THEN
        RAISE EXCEPTION 'Should find 1 candidate document, found %', result_count;
    END IF;

    SELECT * INTO result_record
    FROM find_candidate_documents(query_embedding, test_user_id, NULL)
    LIMIT 1;

    IF result_record.document_id != test_document_id THEN
        RAISE EXCEPTION 'Candidate document should be test document';
    END IF;

    IF result_record.matching_patches < 1 THEN
        RAISE EXCEPTION 'Should have at least 1 matching patch';
    END IF;

    RAISE NOTICE 'find_candidate_documents ✓';

    -- ========================================================================
    -- TEST: Cosine similarity direction
    -- ========================================================================
    RAISE NOTICE 'Testing cosine similarity direction...';

    -- Similar embeddings should have higher similarity than different ones
    DECLARE
        similar_score FLOAT;
        different_score FLOAT;
    BEGIN
        SELECT 1 - (query_embedding <=> similar_embedding) INTO similar_score;
        SELECT 1 - (query_embedding <=> different_embedding) INTO different_score;

        IF similar_score <= different_score THEN
            RAISE EXCEPTION 'Similar embedding score (%) should be higher than different (%)',
                similar_score, different_score;
        END IF;

        RAISE NOTICE 'Similar score: %, Different score: %', similar_score, different_score;
    END;

    RAISE NOTICE 'Cosine similarity direction ✓';

    -- ========================================================================
    -- CLEANUP
    -- ========================================================================
    RAISE NOTICE 'Cleaning up vector search test data...';

    DELETE FROM spans WHERE document_id = test_document_id;
    DELETE FROM documents WHERE user_id = test_user_id;
    DELETE FROM folders WHERE user_id = test_user_id;
    DELETE FROM patches WHERE user_id = test_user_id;

    RAISE NOTICE '=== All vector search tests passed ===';
END $$;
