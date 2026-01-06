// Mock Supabase client for testing
import { vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof vi.fn<any>>;

export interface MockQueryBuilder {
	select: MockFn;
	insert: MockFn;
	update: MockFn;
	delete: MockFn;
	eq: MockFn;
	is: MockFn;
	in: MockFn;
	order: MockFn;
	single: MockFn;
	rpc: MockFn;
}

export function createMockQueryBuilder(returnData: unknown = null, error: unknown = null): MockQueryBuilder {
	const builder: MockQueryBuilder = {
		select: vi.fn(() => builder),
		insert: vi.fn(() => builder),
		update: vi.fn(() => builder),
		delete: vi.fn(() => builder),
		eq: vi.fn(() => builder),
		is: vi.fn(() => builder),
		in: vi.fn(() => builder),
		order: vi.fn(() => builder),
		single: vi.fn(() => Promise.resolve({ data: returnData, error })),
		rpc: vi.fn(() => Promise.resolve({ data: returnData, error }))
	};

	// Make the builder thenable so await works
	Object.defineProperty(builder, 'then', {
		value: (resolve: (value: { data: unknown; error: unknown }) => void) => {
			resolve({ data: returnData, error });
		}
	});

	return builder;
}

export function createMockSupabaseClient() {
	const mockAuth = {
		getSession: vi.fn((): Promise<{ data: { session: unknown }; error: unknown }> =>
			Promise.resolve({ data: { session: { access_token: 'test-token' } }, error: null })
		),
		getUser: vi.fn((): Promise<{ data: { user: unknown }; error: unknown }> =>
			Promise.resolve({ data: { user: { id: 'test-user-id' } }, error: null })
		),
		signInAnonymously: vi.fn((): Promise<{ data: { user: unknown }; error: unknown }> =>
			Promise.resolve({ data: { user: { id: 'anon-user' } }, error: null })
		),
		signOut: vi.fn(() => Promise.resolve({ error: null }))
	};

	const mockStorage = {
		from: vi.fn(() => ({
			upload: vi.fn(() => Promise.resolve({ error: null })),
			createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: 'https://signed-url.com/file' } })),
			remove: vi.fn(() => Promise.resolve({ error: null }))
		}))
	};

	const mockChannel = {
		on: vi.fn(() => mockChannel),
		subscribe: vi.fn(() => mockChannel),
		unsubscribe: vi.fn()
	};

	return {
		auth: mockAuth,
		storage: mockStorage,
		from: vi.fn(() => createMockQueryBuilder()),
		rpc: vi.fn((): Promise<{ data: unknown; error: unknown }> =>
			Promise.resolve({ data: null, error: null })
		),
		channel: vi.fn(() => mockChannel)
	};
}

export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>;
