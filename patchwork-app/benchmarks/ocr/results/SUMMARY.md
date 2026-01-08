# OCR Benchmark Results Summary

**Date**: January 8, 2026
**Winner**: GPT-4.1-nano (best quality AND cheapest) or granite-docling-258M-ONNX (local)

## Final Model Rankings

| Rank | Model | Score | Avg CER | Cost/M | Notes |
|------|-------|-------|---------|--------|-------|
| 1 | **gpt-4.1-nano** | 96.7 | 5.4% | $0.10 | BEST quality, CHEAPEST API |
| 2 | gpt-4o | 95.8 | 7.7% | $2.50 | Previous best, 25x more expensive |
| 3 | gpt-4.1 | 94.6 | 9.3% | $2.00 | Latest flagship |
| 4 | gpt-4o-mini | 94.1 | 9.6% | $0.15 | Good budget option |
| 5 | gpt-4.1-mini | 94.0 | 10.2% | $0.40 | Mid-tier |
| 6 | **granite-docling-258M-ONNX** | 72.3 | 28.6% | FREE | Best LOCAL model |
| 7 | smoldocling-256M | ~65 | ~35% | FREE | Slightly worse than granite |
| 8 | Tesseract.js | 57.8 | 61.1% | FREE | Traditional OCR baseline |

## OpenAI vs Local Models

OpenAI's GPT-4.1-nano is **~5x better** than the best local model:
- GPT-4.1-nano: 5.4% CER vs granite-docling's 28.6% CER
- GPT-4.1-nano is also the cheapest OpenAI vision model ($0.10/M tokens)

**Trade-offs:**
- OpenAI: Best quality, cheapest API option, requires internet
- granite-docling: Good quality, runs locally, no API costs

### Model cost estimate

Image dimensions: 4284×5712 pixels (most test images)

For OpenAI Vision API with detail: 'high':
1. Image scaled to fit 2048×2048 → 1536×2048
2. Divided into 512×512 tiles: ceil(1536/512) × ceil(2048/512) = 3 × 4 = 12 tiles
3. Token cost: 85 base + (12 tiles × 170) = 2,125 input tokens per image

GPT-4.1-nano pricing:
- Input: $0.10/M tokens
- Output: $0.40/M tokens (estimated ~500 tokens per OCR result)

Cost per image:
- Input: 2,125 × $0.10/1M = $0.00021
- Output: 500 × $0.40/1M = $0.00020
- Total: ~$0.0004 per image (0.04 cents)

That's about $0.04 per 100 images or $4 per 10,000 images.

## Prompt Optimization Results

Tested 14 prompt variants on gpt-4.1-nano (including few-shot examples):

| Rank | Prompt | Score | Avg CER | Notes |
|------|--------|-------|---------|-------|
| 1 | **fewshot-noartifact** | 96.8 | 5.0% | NEW WINNER - eliminates artifacts |
| 2 | baseline | 96.7 | 5.5% | Good but has artifact issues |
| 3 | careful | 96.7 | 5.1% | Low CER |
| 4 | simple | 96.6 | 5.4% | Nearly as good |
| 5 | fewshot-complete | 96.3 | 5.8% | Too complex |
| 10 | fewshot-outline | 90.3 | 14.6% | Too specialized |
| 14 | minimal | 89.4 | 11.0% | Too minimal |

**Key findings:**
- **fewshot-noartifact eliminates asterisk artifacts** (XXXXX, ***, etc.)
- Baseline prompt produces clean output most of the time but occasionally inserts `***`, `XXX`, or `{}`
- Few-shot examples showing "infer from context" behavior work better than complex instructions
- Specialized few-shot (outline-focused) hurts non-outline documents
- Minimal prompts hurt - model needs explicit instructions

**Optimal prompt for OpenAI models (NEW):**
```
Transcribe this typewritten document.

IMPORTANT - Never output:
- Asterisks (*) for unclear characters
- Question marks (?) for uncertain letters
- Any placeholder symbols

Instead, when text is unclear, infer the correct character from context.

Example: If you see "photogr_phy", output "photography" (not "photogr*phy").

Output only the clean transcribed text:
```

## Per-Document Results (gpt-4.1-nano with fewshot-noartifact)

| Document | CER | Semantic | Notes |
|----------|-----|----------|-------|
| story-01 | 2.3% | 0.99 | Excellent |
| journal-01 | 2.3% | 0.98 | Excellent |
| letter-01 | 3.7% | 0.99 | No artifacts |
| poem-01 | 3.9% | 0.99 | Excellent |
| instructions-01 | 4.9% | 0.99 | Great |
| meeting-notes-01 | 7.4% | 1.00 | Good |
| outline-01 | 10.5% | 0.96 | Hardest doc, no artifacts |

## Key Findings

### 1. GPT-4.1-nano Is the Clear Winner
Best quality (5.0% CER) AND cheapest ($0.10/M tokens). No reason to use more expensive models.

### 2. Docling Models Win for Local
granite-docling-258M-ONNX (28.6% CER) is ~5x worse than GPT-4.1-nano but runs locally with no API costs.

### 3. Few-Shot Examples Eliminate Artifacts
The fewshot-noartifact prompt eliminates placeholder artifacts (`***`, `XXX`) that baseline occasionally produces.

### 4. SmolVLM Models Are Unreliable
Catastrophic failures on longer documents make them unsuitable for production.

## Recommendations

**For production OCR:**
1. **Primary**: Use OpenAI GPT-4.1-nano with fewshot-noartifact prompt
2. **Fallback**: granite-docling-258M-ONNX for offline/cost-sensitive use

**For local development:**
1. Use granite-docling-258M-ONNX
2. Fixed prompt: `"Convert this page to docling."`
3. Parse DocTags output to extract plain text

## Test Suite

- 7 typewritten documents (letters, poems, outlines, meeting notes, journal entries, instructions)
- Metrics: CER (Character Error Rate), Semantic Similarity (OpenAI embeddings)
- Score formula: `((100 - avgCER) + (avgSemantic * 100)) / 2`

## Archived Results

Intermediate experiment results are in `archive/` subdirectory.
