-- Database Functions Tests
-- Tests for helper functions like get_document_content, find_similar_patches, etc.

-- Create test user (simulating Supabase auth)
DO $$
DECLARE
    test_user_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    test_folder_id UUID;
    test_document_id UUID;
    test_patch_1_id UUID;
    test_patch_2_id UUID;
    test_typed_id UUID;
    content_result RECORD;
    correction_result RECORD;
    position_result TEXT;
BEGIN
    RAISE NOTICE 'Setting up test data...';

    -- Clean up any existing test data
    DELETE FROM annotations WHERE user_id = test_user_id;
    DELETE FROM spans WHERE document_id IN (SELECT id FROM documents WHERE user_id = test_user_id);
    DELETE FROM documents WHERE user_id = test_user_id;
    DELETE FROM folders WHERE user_id = test_user_id;
    DELETE FROM patches WHERE user_id = test_user_id;
    DELETE FROM typed_content WHERE user_id = test_user_id;
    DELETE FROM corrections WHERE user_id = test_user_id;

    -- Create test folder
    INSERT INTO folders (id, user_id, name, position)
    VALUES (uuid_generate_v4(), test_user_id, 'Test Folder', 'a')
    RETURNING id INTO test_folder_id;

    -- Create test document
    INSERT INTO documents (id, user_id, folder_id, name, current_version)
    VALUES (uuid_generate_v4(), test_user_id, test_folder_id, 'Test Document', 3)
    RETURNING id INTO test_document_id;

    -- Create test patches
    INSERT INTO patches (id, user_id, image_path, extracted_text, status)
    VALUES (uuid_generate_v4(), test_user_id, 'test/patch1.jpg', 'First paragraph of content.

Second paragraph here.', 'applied')
    RETURNING id INTO test_patch_1_id;

    INSERT INTO patches (id, user_id, image_path, extracted_text, status)
    VALUES (uuid_generate_v4(), test_user_id, 'test/patch2.jpg', 'Third paragraph added later.', 'applied')
    RETURNING id INTO test_patch_2_id;

    -- Create typed content
    INSERT INTO typed_content (id, user_id, content)
    VALUES (uuid_generate_v4(), test_user_id, 'User typed this content.')
    RETURNING id INTO test_typed_id;

    -- Create spans for version 1 (first patch applied)
    INSERT INTO spans (document_id, source_type, source_id, source_start, source_end, position, version_added)
    VALUES
        (test_document_id, 'patch', test_patch_1_id, 0, 27, 'a', 1),  -- "First paragraph of content."
        (test_document_id, 'patch', test_patch_1_id, 29, 51, 'b', 1); -- "Second paragraph here."

    -- Create span for version 2 (second patch appended)
    INSERT INTO spans (document_id, source_type, source_id, source_start, source_end, position, version_added)
    VALUES (test_document_id, 'patch', test_patch_2_id, 0, 27, 'c', 2);

    -- Create span for version 3 (typed content replaced second paragraph)
    UPDATE spans SET version_removed = 3
    WHERE document_id = test_document_id AND position = 'b';

    INSERT INTO spans (document_id, source_type, source_id, source_start, source_end, position, version_added)
    VALUES (test_document_id, 'typed', test_typed_id, 0, 24, 'b', 3);

    RAISE NOTICE 'Test data created ✓';

    -- ========================================================================
    -- TEST: get_document_content at current version
    -- ========================================================================
    RAISE NOTICE 'Testing get_document_content at current version...';

    FOR content_result IN
        SELECT * FROM get_document_content(test_document_id)
    LOOP
        RAISE NOTICE 'Position: %, Content: %', content_result.position, content_result.content;
    END LOOP;

    -- Should have 3 spans at current version
    IF (SELECT COUNT(*) FROM get_document_content(test_document_id)) != 3 THEN
        RAISE EXCEPTION 'Expected 3 spans at current version, got %',
            (SELECT COUNT(*) FROM get_document_content(test_document_id));
    END IF;

    RAISE NOTICE 'get_document_content current version ✓';

    -- ========================================================================
    -- TEST: get_document_content at version 1
    -- ========================================================================
    RAISE NOTICE 'Testing get_document_content at version 1...';

    -- Should have 2 spans at version 1
    IF (SELECT COUNT(*) FROM get_document_content(test_document_id, 1)) != 2 THEN
        RAISE EXCEPTION 'Expected 2 spans at version 1, got %',
            (SELECT COUNT(*) FROM get_document_content(test_document_id, 1));
    END IF;

    RAISE NOTICE 'get_document_content version 1 ✓';

    -- ========================================================================
    -- TEST: get_document_content at version 2
    -- ========================================================================
    RAISE NOTICE 'Testing get_document_content at version 2...';

    -- Should have 3 spans at version 2 (including the original second paragraph)
    IF (SELECT COUNT(*) FROM get_document_content(test_document_id, 2)) != 3 THEN
        RAISE EXCEPTION 'Expected 3 spans at version 2, got %',
            (SELECT COUNT(*) FROM get_document_content(test_document_id, 2));
    END IF;

    -- Check that version 2 has the original content, not the typed replacement
    IF NOT EXISTS (
        SELECT 1 FROM get_document_content(test_document_id, 2)
        WHERE content LIKE '%Second paragraph%'
    ) THEN
        RAISE EXCEPTION 'Version 2 should contain original second paragraph';
    END IF;

    RAISE NOTICE 'get_document_content version 2 ✓';

    -- ========================================================================
    -- TEST: record_correction (upsert)
    -- ========================================================================
    RAISE NOTICE 'Testing record_correction...';

    -- First correction
    SELECT * INTO correction_result FROM record_correction(test_user_id, 'teh', 'the');
    IF correction_result.count != 1 THEN
        RAISE EXCEPTION 'First correction count should be 1, got %', correction_result.count;
    END IF;

    -- Second correction of same error
    SELECT * INTO correction_result FROM record_correction(test_user_id, 'teh', 'the');
    IF correction_result.count != 2 THEN
        RAISE EXCEPTION 'Second correction count should be 2, got %', correction_result.count;
    END IF;

    -- Third correction of same error
    SELECT * INTO correction_result FROM record_correction(test_user_id, 'teh', 'the');
    IF correction_result.count != 3 THEN
        RAISE EXCEPTION 'Third correction count should be 3, got %', correction_result.count;
    END IF;

    -- Different correction
    SELECT * INTO correction_result FROM record_correction(test_user_id, 'adn', 'and');
    IF correction_result.count != 1 THEN
        RAISE EXCEPTION 'Different correction count should be 1, got %', correction_result.count;
    END IF;

    RAISE NOTICE 'record_correction ✓';

    -- ========================================================================
    -- TEST: fractional_index_between
    -- ========================================================================
    RAISE NOTICE 'Testing fractional_index_between...';

    -- Between 'a' and 'c' should be around 'b'
    SELECT fractional_index_between('a', 'c') INTO position_result;
    IF position_result != 'b' THEN
        RAISE EXCEPTION 'Between a and c should be b, got %', position_result;
    END IF;

    -- Between 'a' and 'b' should be something in between
    SELECT fractional_index_between('a', 'b') INTO position_result;
    IF NOT (position_result > 'a' AND position_result < 'b') THEN
        RAISE EXCEPTION 'Between a and b should be between them, got %', position_result;
    END IF;

    -- Between empty and 'z' should work
    SELECT fractional_index_between('', 'z') INTO position_result;
    IF position_result IS NULL OR position_result = '' THEN
        RAISE EXCEPTION 'Between empty and z should return a valid position';
    END IF;

    RAISE NOTICE 'fractional_index_between ✓';

    -- ========================================================================
    -- CLEANUP
    -- ========================================================================
    RAISE NOTICE 'Cleaning up test data...';

    DELETE FROM annotations WHERE user_id = test_user_id;
    DELETE FROM spans WHERE document_id = test_document_id;
    DELETE FROM documents WHERE user_id = test_user_id;
    DELETE FROM folders WHERE user_id = test_user_id;
    DELETE FROM patches WHERE user_id = test_user_id;
    DELETE FROM typed_content WHERE user_id = test_user_id;
    DELETE FROM corrections WHERE user_id = test_user_id;

    RAISE NOTICE '=== All database function tests passed ===';
END $$;
