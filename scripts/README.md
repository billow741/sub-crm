# 教材库 AI 提取脚本

将教材 PDF 通过 MarkItDown → LLM 提取 → 写入 CRM 的 `unit_content` 表。

## 依赖

```bash
# 创建虚拟环境
uv venv ~/.textbook-env --python 3.12
source ~/.textbook-env/bin/activate

# 安装依赖
uv pip install 'markitdown[all]' openai
```

## 用法

### 单个 PDF

```bash
python extract_textbook.py path/to/EU-L1-Unit1-Friends.pdf EU-L1 1
```

提取后只打印 JSON，不上传。

### 单个 PDF + 自动上传

```bash
python extract_textbook.py path/to/EU-L1-Unit1-Friends.pdf EU-L1 1 --upload
```

调 CRM `POST /api/v1/textbooks/content/EU-L1/1` 写入数据库。

### 批量目录

```bash
python extract_textbook.py --batch path/to/EU-L1-pdfs/ EU-L1 --upload
```

脚本会从文件名中匹配 `Unit1`、`unit-2`、`Unit_3` 等模式推断 `unit_number`。

### 输出到文件

```bash
python extract_textbook.py path/to/file.pdf EU-L1 1 -o result.json
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `NVIDIA_API_KEY` | (内置) | NVIDIA NIM API key (OpenAI 兼容) |
| `NVIDIA_MODEL` | `z-ai/glm-5.2` | 模型名 |
| `CRM_API_BASE` | `https://api.changtian.dpdns.org` | CRM API |
| `CRM_API_KEY` | `sunnybridge-dev-key-2024` | CRM API key |

切换 LLM 提供商只需要改 `NVIDIA_BASE_URL` / `NVIDIA_API_KEY` / `NVIDIA_MODEL` 常量（或环境变量），代码里使用的是 OpenAI SDK 兼容接口。

举例 — 用 OpenAI：

```bash
export NVIDIA_BASE_URL=https://api.openai.com/v1
export NVIDIA_API_KEY=sk-...
export NVIDIA_MODEL=gpt-4o
python extract_textbook.py file.pdf EU-L1 1 --upload
```

用 DeepSeek：

```bash
export NVIDIA_BASE_URL=https://api.deepseek.com/v1
export NVIDIA_API_KEY=sk-...
export NVIDIA_MODEL=deepseek-chat
python extract_textbook.py file.pdf EU-L1 1 --upload
```

(环境变量名保持原样，脚本会读 `NVIDIA_API_KEY` / `NVIDIA_BASE_URL` / `NVIDIA_MODEL`，但实际可以指向任意 OpenAI 兼容网关。)

## 流程

```
PDF  →  MarkItDown 提取 Markdown  →  LLM 结构化提取 JSON  →  POST 到 CRM  →  写入 D1 unit_content
```

## 数据结构

输出 JSON 格式：

```json
{
  "vocab": [
    {"word": "friend", "translation": "朋友", "is_core": true, "difficulty": 1}
  ],
  "patterns": [
    {"pattern": "What is your name?", "translation": "你叫什么名字？", "is_core": true}
  ],
  "grammar": [
    {"point": "Subject pronouns (I/you/he/she)", "example": "I am Tom.", "is_core": true}
  ]
}
```
