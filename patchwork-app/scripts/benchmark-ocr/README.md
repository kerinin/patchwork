# OCR Benchmark Scripts

Scripts for testing and comparing OCR models on typewritten documents.

## Winners

### Best Quality + Cheapest API: OpenAI GPT-4.1-nano
- **Score**: 96.7
- **Avg CER**: 5.4%
- **Cost**: $0.10/M tokens (cheapest vision model)
- Requires API key and internet connection

### Best Local: granite-docling-258M-ONNX
- **Score**: 72.3
- **Avg CER**: 28.6%
- Runs locally, no API costs
- Uses fixed prompt: `"Convert this page to docling."`

## Scripts

### `index.ts` - Production Benchmark
Tests the production OCR implementation against the test suite.

```bash
npx tsx scripts/benchmark-ocr/index.ts
npx tsx scripts/benchmark-ocr/index.ts --case letter-01 --verbose
```

### `model-experiment.ts` - Model Comparison
Compares multiple VLM models (local + OpenAI) for OCR quality.

```bash
npx tsx scripts/benchmark-ocr/model-experiment.ts
npx tsx scripts/benchmark-ocr/model-experiment.ts --model gpt-4.1-nano
npx tsx scripts/benchmark-ocr/model-experiment.ts --model granite-docling-258m-onnx
```

### `openai-prompt-experiment.ts` - Prompt Optimization
Tests multiple prompt variants on GPT-4.1-nano.

```bash
npx tsx scripts/benchmark-ocr/openai-prompt-experiment.ts
npx tsx scripts/benchmark-ocr/openai-prompt-experiment.ts --prompt careful
```

### `tesseract-benchmark.ts` - Baseline
Tests Tesseract.js as a traditional OCR baseline.

```bash
npx tsx scripts/benchmark-ocr/tesseract-benchmark.ts
```

### `mlx-benchmark.py` - Fast Iteration (Apple Silicon)
MLX-based benchmark for rapid iteration on Apple Silicon (~5x faster).

```bash
python scripts/benchmark-ocr/mlx-benchmark.py
python scripts/benchmark-ocr/mlx-benchmark.py --case story-01 --verbose
```

### `metrics.ts` - Shared Utilities
Provides CER calculation and semantic similarity metrics.

## Environment

Requires `OPENAI_API_KEY` for semantic similarity calculations. Add to `.env`:

```
OPENAI_API_KEY=sk-...
```

## Model Rankings

| Model | Score | Avg CER | Cost/M | Notes |
|-------|-------|---------|--------|-------|
| **gpt-4.1-nano** | 96.7 | 5.4% | $0.10 | Best quality, cheapest API |
| gpt-4o | 95.8 | 7.7% | $2.50 | Previous best |
| gpt-4.1 | 94.6 | 9.3% | $2.00 | Latest flagship |
| gpt-4o-mini | 94.1 | 9.6% | $0.15 | Good budget option |
| gpt-4.1-mini | 94.0 | 10.2% | $0.40 | Mid-tier |
| **granite-docling-258M-ONNX** | 72.3 | 28.6% | FREE | Best local model |
| smoldocling-256M | ~65 | ~35% | FREE | Runner-up local |
| Tesseract.js | 57.8 | 61.1% | FREE | Traditional OCR baseline |

## Test Cases

Test images are in `benchmarks/ocr/images/` with expected outputs in `benchmarks/ocr/expected/`.

Categories:
- `typewritten` - Main test set (letters, poems, meeting notes, etc.)
- `handwritten` - Future expansion

Known limitations:
- `story-01` has a rotated image causing inflated CER

## Metrics

- **CER (Character Error Rate)**: Levenshtein distance / expected length * 100
- **Semantic Similarity**: Cosine similarity of OpenAI embeddings
- **Score**: `((100 - avgCER) + (avgSemantic * 100)) / 2`
