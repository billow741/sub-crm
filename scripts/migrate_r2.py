"""
Cloudflare R2 跨账号文件一键对拷迁移脚本 (基于 S3 兼容协议)
===========================================================
用途: 将旧 Cloudflare 账号 R2 存储桶内的所有文件 (包括 PDF 和页面切图)
      原封不动、无损流式迁移到新账号的 R2 存储桶中。

依赖: Python 3 + boto3 (已预装)
运行: python scripts/migrate_r2.py
"""

import os
import sys
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

# 解决 Windows 终端编码问题
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import boto3
from botocore.config import Config

CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'r2_config.json')

DEFAULT_CONFIG = {
    "_comment": "请在此处填入旧账号(源)与新账号(目标)的 R2 API 凭证",
    "SOURCE": {
        "account_id": "旧账号的_ACCOUNT_ID (在 Cloudflare 首页右侧查看)",
        "access_key_id": "旧账号的_R2_ACCESS_KEY_ID",
        "secret_access_key": "旧账号的_R2_SECRET_ACCESS_KEY",
        "bucket_name": "sunnybridge-textbooks"
    },
    "DESTINATION": {
        "account_id": "新账号的_ACCOUNT_ID (如: 3ec55f7fdb8c8b5f03f10da9ae5c9591)",
        "access_key_id": "新账号的_R2_ACCESS_KEY_ID",
        "secret_access_key": "新账号的_R2_SECRET_ACCESS_KEY",
        "bucket_name": "sunnybridge-textbooks"
    },
    "MAX_WORKERS": 5,
    "OVERWRITE": False
}

def load_or_create_config():
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_CONFIG, f, indent=2, ensure_ascii=False)
        print(f"\n📝 已自动为您生成配置文件: {CONFIG_FILE}")
        print("请用文本编辑器打开该文件，填入旧账号与新账号的 R2 API Token 凭证后再次运行本脚本。\n")
        sys.exit(0)

    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        cfg = json.load(f)

    # 检查是否还是占位符
    if "旧账号的" in cfg.get("SOURCE", {}).get("account_id", "") or "新账号的" in cfg.get("DESTINATION", {}).get("account_id", ""):
        print(f"\n⚠️ 请先编辑配置文件: {CONFIG_FILE}")
        print("将其中的占位符替换为您真实的 Cloudflare Account ID 和 R2 API Token (Access Key & Secret Key)。\n")
        sys.exit(1)

    return cfg

def create_s3_client(account_id, access_key, secret_key):
    endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
    return boto3.client(
        's3',
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version='s3v4', retries={'max_attempts': 3, 'mode': 'standard'})
    )

def list_all_objects(s3_client, bucket_name):
    paginator = s3_client.get_paginator('list_objects_v2')
    objects = []
    for page in paginator.paginate(Bucket=bucket_name):
        if 'Contents' in page:
            objects.extend(page['Contents'])
    return objects

def copy_single_object(src_s3, dst_s3, src_bucket, dst_bucket, obj_key, obj_size, overwrite=False, existing_dst_map=None):
    if not overwrite and existing_dst_map and obj_key in existing_dst_map:
        if existing_dst_map[obj_key] == obj_size:
            return {"key": obj_key, "status": "skipped", "size": obj_size, "msg": "已存在且大小一致，跳过"}

    try:
        # 流式读取旧 R2
        response = src_s3.get_object(Bucket=src_bucket, Key=obj_key)
        body = response['Body'].read()
        content_type = response.get('ContentType', 'application/octet-stream')

        # 写入新 R2
        dst_s3.put_object(
            Bucket=dst_bucket,
            Key=obj_key,
            Body=body,
            ContentType=content_type
        )
        return {"key": obj_key, "status": "success", "size": obj_size}
    except Exception as e:
        return {"key": obj_key, "status": "failed", "size": obj_size, "error": str(e)}

def main():
    print("=" * 65)
    print("🚀 Cloudflare R2 跨账号文件迁移工具")
    print("=" * 65)

    cfg = load_or_create_config()
    src_cfg = cfg["SOURCE"]
    dst_cfg = cfg["DESTINATION"]
    max_workers = cfg.get("MAX_WORKERS", 5)
    overwrite = cfg.get("OVERWRITE", False)

    print(f"\n📡 正在连接源账号 R2 (Bucket: {src_cfg['bucket_name']})...")
    try:
        src_s3 = create_s3_client(src_cfg["account_id"], src_cfg["access_key_id"], src_cfg["secret_access_key"])
        src_objects = list_all_objects(src_s3, src_cfg["bucket_name"])
        print(f"✅ 源 Bucket 扫描完成: 共发现 {len(src_objects)} 个文件")
    except Exception as e:
        print(f"❌ 连接源 R2 失败: {e}")
        return

    if len(src_objects) == 0:
        print("ℹ️ 源 Bucket 中没有文件需要迁移。")
        return

    print(f"\n📡 正在连接目标账号 R2 (Bucket: {dst_cfg['bucket_name']})...")
    try:
        dst_s3 = create_s3_client(dst_cfg["account_id"], dst_cfg["access_key_id"], dst_cfg["secret_access_key"])
        dst_objects = list_all_objects(dst_s3, dst_cfg["bucket_name"])
        existing_dst_map = {o['Key']: o['Size'] for o in dst_objects}
        print(f"✅ 目标 Bucket 连接成功 (当前已有 {len(dst_objects)} 个文件)")
    except Exception as e:
        print(f"❌ 连接目标 R2 失败: {e}")
        print("💡 提示: 请确认新账号中已创建了该 Bucket，且 API Token 拥有 'Object Read & Write' 权限。")
        return

    total_size = sum(o['Size'] for o in src_objects)
    print(f"\n📦 开始迁移任务:")
    print(f"   • 总文件数: {len(src_objects)}")
    print(f"   • 总大小: {total_size / 1024 / 1024:.2f} MB")
    print(f"   • 并发线程数: {max_workers}")
    print("-" * 65)

    success_count = 0
    skipped_count = 0
    failed_count = 0
    transferred_bytes = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                copy_single_object,
                src_s3, dst_s3,
                src_cfg["bucket_name"], dst_cfg["bucket_name"],
                obj['Key'], obj['Size'],
                overwrite, existing_dst_map
            ): obj for obj in src_objects
        }

        for idx, future in enumerate(as_completed(futures), start=1):
            res = future.result()
            key = res["key"]
            status = res["status"]
            size_kb = res["size"] / 1024

            if status == "success":
                success_count += 1
                transferred_bytes += res["size"]
                print(f"[{idx}/{len(src_objects)}] ✅ 迁移成功: {key} ({size_kb:.1f} KB)")
            elif status == "skipped":
                skipped_count += 1
                print(f"[{idx}/{len(src_objects)}] ⏩ 跳过(已存在): {key}")
            else:
                failed_count += 1
                print(f"[{idx}/{len(src_objects)}] ❌ 迁移失败: {key} | 错误: {res.get('error')}")

    duration = time.time() - start_time
    print("\n" + "=" * 65)
    print("🎉 迁移任务执行完成!")
    print(f"   • 耗时: {duration:.1f} 秒")
    print(f"   • 成功: {success_count} 个")
    print(f"   • 跳过(已存在): {skipped_count} 个")
    print(f"   • 失败: {failed_count} 个")
    print(f"   • 传输数据量: {transferred_bytes / 1024 / 1024:.2f} MB")
    print("=" * 65)

if __name__ == '__main__':
    main()
