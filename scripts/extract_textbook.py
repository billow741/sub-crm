#!/usr/bin/env python3
"""
教材库 AI 提取脚本 — MarkItDown + LLM (NVIDIA NIM)

用法:
    python extract_textbook.py <pdf_path> <textbook_code> <unit_number>
    python extract_textbook.py /tmp/textbook_test/EU-L1-Unit1-Friends.pdf EU-L1 1

批量:
    python extract_textbook.py --batch /tmp/textbook_test/ EU-L1

输出:
    - 标准输出: JSON 结果 (便于管道处理)
    - 若指定 --upload: 自动调 CRM API 写入 unit_content 表

环境变量:
    NVIDIA_API_KEY  (or default to key below)
    CRM_API_KEY     (default: sunnybridge-dev-key-2024)
    CRM_API_BASE    (default: https://api.changtian.dpdns.org)
"""
import sys, os, json, re, argparse, time
from pathlib import Path

# NVIDIA NIM 配置 (OpenAI 兼容)
# LLM 配置 (OpenAI 兼容接口,支持 NVIDIA NIM / OpenAI / DeepSeek / 智谱等)
# 切换提供商只需改这三个环境变量,无需改代码
LLM_BASE_URL = os.environ.get(
    "NVIDIA_BASE_URL",
    "https://integrate.api.nvidia.com/v1"
)
LLM_API_KEY = os.environ.get(
    "NVIDIA_API_KEY",
    "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"
)
LLM_MODEL = os.environ.get("NVIDIA_MODEL", "z-ai/glm-5.2")

CRM_API_BASE = os.environ.get(
    "CRM_API_BASE",
    "https://api.changtian.dpdns.org"
)
CRM_API_KEY = os.environ.get("CRM_API_KEY", "sunnybridge-dev-key-2024")


# ============================================================
# 1. MarkItDown: PDF → Markdown
# ============================================================
def pdf_to_markdown(pdf_path: str) -> str:
    from markitdown import MarkItDown
    md = MarkItDown()
    result = md.convert(pdf_path)
    return result.text_content


# ============================================================
# 2. LLM: Markdown → 结构化 JSON
# ============================================================
EXTRACTION_PROMPT = """You are a textbook content extractor. Given the Markdown text of a language textbook unit, extract vocabulary, sentence patterns, and grammar points into structured JSON.

Return ONLY valid JSON (no markdown fences, no explanation) in this exact schema:

{
  "vocab": [
    {"word": "apple", "translation": "苹果", "is_core": true, "difficulty": 1}
  ],
  "patterns": [
    {"pattern": "I like apples.", "translation": "我喜欢苹果。", "is_core": true}
  ],
  "grammar": [
    {"point": "Present Simple", "example": "She plays tennis.", "is_core": true}
  ]
}

Rules:
- "is_core": true if the item appears prominently in the unit's main vocabulary list or is a target pattern/grammar; false if supplementary.
- "difficulty": 1 (basic/critical), 2 (intermediate), 3 (advanced).
- If a translation is provided in parentheses or list items, include it; otherwise leave translation as null.
- Clean up bullet artifacts (e.g., (cid:127), •, -) from words/patterns.
- If no vocab/patterns/grammar is found, return an empty array for that field.
- Return ONLY the JSON object. No code fences, no preamble.
"""

def llm_extract(markdown_text: str) -> dict:
    """调用 NVIDIA NIM (OpenAI 兼容) 做结构化提取"""
    from openai import OpenAI

    client = OpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)

    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": EXTRACTION_PROMPT},
            {"role": "user", "content": f"Here is the textbook unit content as Markdown:\n\n{markdown_text}"}
        ],
        temperature=0.1,
        max_tokens=4096,
    )
    raw = response.choices[0].message.content.strip()

    # 去掉可能的 ```json ... ``` 包裹
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        # 失败时打印原始输出便于调试
        print(f"LLM JSON parse failed: {e}", file=sys.stderr)
        print(f"Raw output:\n{raw[:500]}", file=sys.stderr)
        return {"vocab": [], "patterns": [], "grammar": []}


# ============================================================
# 3. Upload to CRM (POST /api/v1/textbooks/content/:code/:num)
# ============================================================
def upload_to_crm(textbook_code: str, unit_number: int, content: dict) -> dict:
    import urllib.request

    url = f"{CRM_API_BASE}/api/v1/textbooks/content/{textbook_code}/{unit_number}"
    body = json.dumps({
        **content,
        "extracted_by": "claude"  # 标记为 AI 提取
    }).encode("utf-8")

    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "X-API-Key": CRM_API_KEY
    })

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"error": str(e)}


# ============================================================
# 4. Pipeline: 单个文件
# ============================================================
def process_one(pdf_path: str, textbook_code: str, unit_number: int, do_upload: bool = False) -> dict:
    print(f"\n📄 Processing: {Path(pdf_path).name}")
    print(f"   textbook_code={textbook_code} unit_number={unit_number}")

    # Step 1: PDF → Markdown
    t0 = time.time()
    md_text = pdf_to_markdown(pdf_path)
    print(f"   ✅ MarkItDown: {len(md_text)} chars ({time.time()-t0:.1f}s)")

    # Step 2: Markdown → JSON
    t0 = time.time()
    content = llm_extract(md_text)
    n_vocab = len(content.get("vocab", []))
    n_pat = len(content.get("patterns", []))
    n_gram = len(content.get("grammar", []))
    print(f"   ✅ LLM extract: vocab={n_vocab} patterns={n_pat} grammar={n_gram} ({time.time()-t0:.1f}s)")

    result = {
        "pdf_path": pdf_path,
        "textbook_code": textbook_code,
        "unit_number": unit_number,
        "content": content
    }

    # Step 3: Upload (可选)
    if do_upload:
        t0 = time.time()
        resp = upload_to_crm(textbook_code, unit_number, content)
        if "error" in resp:
            print(f"   ❌ Upload failed: {resp['error']}")
        else:
            print(f"   ✅ Uploaded to CRM ({time.time()-t0:.1f}s)")
        result["upload_response"] = resp

    return result


# ============================================================
# 5. 批量: 从文件名推断 unit_number, 或用 --batch 指定目录
# ============================================================
UNIT_NUM_RE = re.compile(r"unit[_-]?(\d+)", re.IGNORECASE)

def process_batch(dir_path: str, textbook_code: str, do_upload: bool = False) -> list:
    pdfs = sorted(Path(dir_path).glob("*.pdf"))
    if not pdfs:
        print(f"No PDFs found in {dir_path}")
        return []

    results = []
    for pdf in pdfs:
        m = UNIT_NUM_RE.search(pdf.name)
        if not m:
            print(f"⚠️  Skipping {pdf.name} (can't determine unit_number)")
            continue
        unit_num = int(m.group(1))
        result = process_one(str(pdf), textbook_code, unit_num, do_upload=do_upload)
        results.append(result)

    return results


# ============================================================
# Main
# ============================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="教材库 AI 提取 (MarkItDown + LLM). 切换 LLM 提供商用 NVIDIA_BASE_URL / NVIDIA_API_KEY / NVIDIA_MODEL 环境变量。"
    )
    parser.add_argument("pdf_path", nargs="?", help="单个 PDF 文件路径")
    parser.add_argument("textbook_code", nargs="?", help="教材代码 (如 EU-L1)")
    parser.add_argument("unit_number", nargs="?", type=int, help="单元号")
    parser.add_argument("--batch", metavar="DIR", help="批量处理目录下所有 PDF")
    parser.add_argument("--upload", action="store_true", help="提取后自动上传到 CRM")
    parser.add_argument("--output", "-o", help="输出 JSON 文件路径 (可选)")
    args = parser.parse_args()

    if args.batch:
        results = process_batch(args.batch, args.textbook_code or "EU-L1", do_upload=args.upload)
        output = results
    elif args.pdf_path and args.textbook_code and args.unit_number is not None:
        output = process_one(args.pdf_path, args.textbook_code, args.unit_number, do_upload=args.upload)
    else:
        parser.print_help()
        sys.exit(1)

    # 输出 JSON
    out_str = json.dumps(output, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(out_str, encoding="utf-8")
        print(f"\n💾 Saved to {args.output}")
    else:
        print("\n" + out_str)
