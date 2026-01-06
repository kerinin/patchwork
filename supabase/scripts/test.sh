#!/bin/bash
# Run backend tests locally
# Usage: ./scripts/test.sh

set -e

cd "$(dirname "$0")/.."

echo "🔄 Resetting database..."
supabase db reset

echo "🚀 Starting Edge Functions..."
supabase functions serve --no-verify-jwt --env-file functions/.env.local &
FUNCTIONS_PID=$!

# Cleanup on exit
trap "kill $FUNCTIONS_PID 2>/dev/null || true" EXIT

echo "⏳ Waiting for functions to initialize..."
sleep 5

# Verify functions are responding
if ! curl -s http://127.0.0.1:54321/functions/v1/generate-suggestion -X POST -H "Content-Type: application/json" -d '{}' > /dev/null 2>&1; then
    echo "⚠️  Functions may not be ready, waiting longer..."
    sleep 5
fi

echo "🧪 Running tests..."
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
export FUNCTIONS_URL="http://127.0.0.1:54321/functions/v1"

cd functions
deno test --no-check --no-lock --allow-net --allow-env _tests/

echo "✅ All tests passed!"
