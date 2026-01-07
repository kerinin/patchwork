# OCR Benchmark Harness Design

## Goal

Build a test harness to measure OCR quality, enabling:
- Confidence that the system works correctly
- Comparison of different VLM models (correctness, latency, memory)
- Detection of regressions when changing prompts or configuration

## Document Types

The benchmark covers two main document types:
- **Handwritten notes** - Personal handwriting from notebooks, index cards
- **Typewritten pages** - Mechanical typewriter output, possibly with handwritten annotations

## Benchmark Dataset

**Location:** `patchwork-app/benchmarks/ocr/`

**Structure:**
```
benchmarks/ocr/
├── manifest.json           # List of test cases with metadata
├── samples/
│   ├── handwritten-01.jpg
│   ├── handwritten-01.md   # Ground truth (markdown)
│   ├── typewritten-01.jpg
│   ├── typewritten-01.md
│   ├── annotated-01.jpg    # Typewritten with handwritten annotations
│   └── annotated-01.md
└── results/
    └── <timestamp>.json    # Historical results
```

**manifest.json:**
```json
{
  "cases": [
    {
      "id": "handwritten-01",
      "image": "samples/handwritten-01.jpg",
      "expected": "samples/handwritten-01.md",
      "category": "handwritten",
      "notes": "Personal notes, cursive"
    }
  ]
}
```

**Dataset size:** 5-10 test cases initially, expandable as needed.

## Metrics

**Per-model (measured once at load):**
- Model memory footprint (MB)

**Per-test case:**
| Metric | Description | Calculation |
|--------|-------------|-------------|
| CER | Character Error Rate | Levenshtein distance / expected length |
| Semantic Similarity | Meaning preservation | Cosine similarity of OpenAI embeddings |
| Elapsed Time | Inference duration | Wall clock time (ms) |

**Pass/Fail Thresholds (starting points):**
- CER: < 10%
- Semantic similarity: > 0.85

These are intentionally loose initial values to be tuned based on real results.

## Shared OCR Module Architecture

Refactor `ocr.ts` to support both browser and Node.js environments.

**File structure:**
```
patchwork-app/src/lib/services/
├── ocr/
│   ├── index.ts              # Public API (re-exports)
│   ├── core.ts               # Platform-agnostic VLM logic
│   ├── image-prep.ts         # Image preparation interface
│   ├── image-prep.browser.ts # Browser implementation (canvas)
│   └── image-prep.node.ts    # Node implementation (sharp)
```

**core.ts:** Contains VLM model loading and inference. Receives prepared `RawImage`, doesn't handle image loading/resizing.

**image-prep.ts interface:**
```typescript
export type ImageSource = string | File | Blob | Buffer;
export type ImagePreparer = (source: ImageSource) => Promise<RawImage>;
```

**Environment selection:**
- Benchmark script explicitly imports `image-prep.node.ts`
- App bundler (Vite/SvelteKit) uses `image-prep.browser.ts`

## CLI Benchmark Script

**Location:** `patchwork-app/scripts/benchmark-ocr.ts`

**Invocation:**
```bash
npm run benchmark:ocr                              # Run all cases
npm run benchmark:ocr -- --category handwritten    # Filter by category
npm run benchmark:ocr -- --case annotated-01       # Single case
```

**Execution flow:**
1. Load manifest and filter cases
2. Measure baseline memory
3. Initialize OCR model
4. Measure model memory footprint
5. For each case:
   - Load image from disk
   - Run `performOcr()` with timing
   - Compare result against ground truth
   - Calculate CER and semantic similarity
6. Output summary table
7. Save detailed JSON to `results/`

**Output example:**
```
OCR Benchmark Results
=====================
Model: HuggingFaceTB/SmolVLM-256M-Instruct
Memory: 340MB

Case              Category     CER    Semantic   Time     Status
handwritten-01    handwritten  4.2%   0.94       1,240ms  PASS
typewritten-01    typewritten  1.1%   0.98       890ms    PASS
annotated-01      annotated    12.3%  0.82       1,450ms  FAIL

Summary: 2/3 passed | Avg CER: 5.9% | Avg Semantic: 0.91 | Avg Time: 1,193ms
```

## Dependencies

**New dependencies:**
- `sharp` - Image processing for Node.js
- `fastest-levenshtein` - CER calculation

**Existing dependencies used:**
- `@huggingface/transformers` - VLM inference
- `openai` - Embeddings for semantic similarity

## Known Quality Issues to Monitor

1. **Mode confusion** - Model describes image instead of transcribing text
2. **Newline semantics** - Line breaks due to page width vs intentional paragraph breaks
3. **Annotation handling** - Handwritten editorial marks need special treatment

## Future Enhancements (Not in Scope)

- CI integration with threshold-based exit codes
- Historical trend visualization
- Per-category threshold tuning
- Multiple model comparison in single run
