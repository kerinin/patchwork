#!/usr/bin/env python3
"""
MLX-based OCR benchmark for Apple Silicon.
~10-50x faster than ONNX/transformers.js for rapid iteration.

Usage:
    pip install mlx-vlm pillow openai python-Levenshtein
    python scripts/benchmark-ocr/mlx-benchmark.py
    python scripts/benchmark-ocr/mlx-benchmark.py --case story-01 --repetition-penalty 1.2

Requires: Apple Silicon Mac, Python 3.12+
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    from mlx_vlm import load, generate
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.utils import load_config
    from PIL import Image
    import Levenshtein
    from openai import OpenAI
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("\nInstall with:")
    print("  pip install mlx-vlm pillow openai python-Levenshtein")
    sys.exit(1)

# Configuration
MODEL_PATH = "ibm-granite/granite-docling-258M-mlx"
PROMPT = "Convert this page to docling."

# Metrics calculation
def calculate_cer(expected: str, actual: str) -> float:
    """Character Error Rate using Levenshtein distance."""
    if not expected:
        return 100.0 if actual else 0.0
    distance = Levenshtein.distance(expected, actual)
    return (distance / len(expected)) * 100

def calculate_semantic_similarity(expected: str, actual: str, client: OpenAI) -> float:
    """Semantic similarity using OpenAI embeddings."""
    if not expected or not actual:
        return 0.0

    try:
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=[expected, actual]
        )
        emb1 = response.data[0].embedding
        emb2 = response.data[1].embedding

        # Cosine similarity
        dot_product = sum(a * b for a, b in zip(emb1, emb2))
        norm1 = sum(a * a for a in emb1) ** 0.5
        norm2 = sum(b * b for b in emb2) ** 0.5

        return dot_product / (norm1 * norm2)
    except Exception as e:
        print(f"  Warning: Embedding failed: {e}")
        return 0.0

def parse_doctags(doctags_output: str) -> str:
    """Parse DocTags output and extract plain text."""
    import re

    output = doctags_output

    # Strip prompt prefix
    output = re.sub(r'^user\n.*?\nassistant\n', '', output, flags=re.DOTALL)

    # Handle Assistant: marker
    if 'Assistant:' in output:
        output = output.split('Assistant:')[-1].strip()

    lines = []

    # Match DocTags
    tag_pattern = r'<(text|code|section|title|caption|formula|list-item|footnote|header|page-header|page-footer)>([^<]*)</\1>'

    for match in re.finditer(tag_pattern, output):
        content = match.group(2)
        # Strip coordinates
        content = re.sub(r'^\d+>\d+>\d+>\d+>', '', content).strip()
        if content:
            lines.append(content)

    # Fallback: raw coordinate patterns
    if not lines:
        for match in re.finditer(r'\d+>\d+>\d+>\d+>([^\n<]+)', output):
            content = match.group(1).strip()
            if content:
                lines.append(content)

    # Last resort: strip all tags and coordinates
    if not lines:
        cleaned = re.sub(r'<[^>]+>', '\n', output)
        cleaned = re.sub(r'\d+>\d+>\d+>\d+>', '', cleaned)
        cleaned = re.sub(r'\n+', '\n', cleaned).strip()
        return cleaned

    return '\n'.join(lines)

def main():
    parser = argparse.ArgumentParser(description='MLX OCR Benchmark')
    parser.add_argument('--case', type=str, help='Run only a specific test case')
    parser.add_argument('--repetition-penalty', type=float, default=1.0, help='Repetition penalty (default: 1.0)')
    parser.add_argument('--temperature', type=float, default=0.0, help='Temperature (default: 0.0)')
    parser.add_argument('--max-tokens', type=int, default=4096, help='Max tokens (default: 4096)')
    parser.add_argument('--verbose', action='store_true', help='Show raw output')
    args = parser.parse_args()

    openai_api_key = os.environ.get('OPENAI_API_KEY')
    if not openai_api_key:
        print("Error: OPENAI_API_KEY environment variable required")
        sys.exit(1)

    openai_client = OpenAI(api_key=openai_api_key)

    # Find benchmark directory
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    benchmark_dir = project_root / 'benchmarks' / 'ocr'

    if not benchmark_dir.exists():
        print(f"Error: Benchmark directory not found: {benchmark_dir}")
        sys.exit(1)

    # Load manifest
    manifest_path = benchmark_dir / 'manifest.json'
    with open(manifest_path) as f:
        manifest = json.load(f)

    # Filter to typewritten cases
    cases = [c for c in manifest['cases'] if c['category'] == 'typewritten']

    # Filter to specific case if requested
    if args.case:
        cases = [c for c in cases if c['id'] == args.case]
        if not cases:
            print(f"Error: Case '{args.case}' not found")
            sys.exit(1)

    print("MLX OCR Benchmark")
    print("=" * 60)
    print(f"Model: {MODEL_PATH}")
    print(f"Prompt: {PROMPT}")
    print(f"Test cases: {len(cases)}")
    print(f"Generation params: max_tokens={args.max_tokens}, temp={args.temperature}, rep_penalty={args.repetition_penalty}")
    print()

    # Load model
    print("Loading model...")
    load_start = time.time()
    model, processor = load(MODEL_PATH)
    config = load_config(MODEL_PATH)
    load_time = time.time() - load_start
    print(f"Model loaded in {load_time:.1f}s")
    print()

    # Prepare prompt template
    formatted_prompt = apply_chat_template(processor, config, PROMPT, num_images=1)

    results = []
    total_tokens = 0
    total_inference_time = 0

    print("Running tests...")
    print("-" * 60)

    for case in cases:
        case_id = case['id']
        image_path = benchmark_dir / case['image']
        expected_path = benchmark_dir / case['expected']

        print(f"  {case_id}...", end=" ", flush=True)

        # Load expected text
        with open(expected_path) as f:
            expected = f.read()

        # Load image
        pil_image = Image.open(image_path)

        # Run inference
        inference_start = time.time()
        result = generate(
            model,
            processor,
            formatted_prompt,
            [pil_image],
            max_tokens=args.max_tokens,
            temperature=args.temperature,
            repetition_penalty=args.repetition_penalty,
            verbose=False
        )
        inference_time = time.time() - inference_start

        # Extract text from result (GenerationResult object)
        output = result.text if hasattr(result, 'text') else str(result)

        if args.verbose:
            print(f"\n--- Raw output ---\n{output}\n--- End ---\n")

        # Parse output
        actual = parse_doctags(output)

        # Estimate tokens (rough)
        tokens = len(output.split())
        total_tokens += tokens
        total_inference_time += inference_time

        # Calculate metrics
        cer = calculate_cer(expected, actual)
        semantic = calculate_semantic_similarity(expected, actual, openai_client)

        passed = cer <= manifest['thresholds']['cer'] and semantic >= manifest['thresholds']['semantic']

        results.append({
            'case_id': case_id,
            'cer': round(cer, 1),
            'semantic': round(semantic, 2),
            'passed': passed,
            'inference_ms': round(inference_time * 1000),
            'tokens': tokens
        })

        print(f"CER: {cer:.1f}%, Sem: {semantic:.2f}, Time: {inference_time*1000:.0f}ms")

    print("-" * 60)

    # Calculate aggregates
    avg_cer = sum(r['cer'] for r in results) / len(results)
    avg_semantic = sum(r['semantic'] for r in results) / len(results)
    avg_inference_ms = sum(r['inference_ms'] for r in results) / len(results)
    pass_count = sum(1 for r in results if r['passed'])
    score = ((100 - avg_cer) + (avg_semantic * 100)) / 2

    tokens_per_sec = total_tokens / total_inference_time if total_inference_time > 0 else 0

    print()
    print("=" * 60)
    print("RESULTS")
    print("=" * 60)
    print(f"  Score:           {score:.1f}")
    print(f"  Avg CER:         {avg_cer:.1f}%")
    print(f"  Avg Semantic:    {avg_semantic:.2f}")
    print(f"  Passed:          {pass_count}/{len(results)}")
    print(f"  Avg Inference:   {avg_inference_ms:.0f}ms")
    print(f"  Tokens/sec:      {tokens_per_sec:.0f}")
    print("=" * 60)

    # Save results
    results_dir = benchmark_dir / 'results'
    results_dir.mkdir(exist_ok=True)

    timestamp = time.strftime('%Y-%m-%dT%H-%M-%S')
    results_path = results_dir / f'mlx-benchmark-{timestamp}.json'

    with open(results_path, 'w') as f:
        json.dump({
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'model': MODEL_PATH,
            'prompt': PROMPT,
            'summary': {
                'score': round(score, 1),
                'avg_cer': round(avg_cer, 1),
                'avg_semantic': round(avg_semantic, 2),
                'pass_count': pass_count,
                'total_count': len(results),
                'avg_inference_ms': round(avg_inference_ms),
                'tokens_per_sec': round(tokens_per_sec)
            },
            'results': results
        }, f, indent=2)

    print(f"\nResults saved to: {results_path}")

if __name__ == '__main__':
    main()
