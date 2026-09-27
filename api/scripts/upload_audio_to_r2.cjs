const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const audioDir = path.join(__dirname, '../../../sub-weapp/src/assets/audio');
const files = fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3'));

console.log(`🚀 开始批量上传 ${files.length} 个 MP3 音频文件到 Cloudflare R2 (sunnybridge-textbooks)...`);

for (const file of files) {
  const localPath = path.join(audioDir, file);
  const r2Key = `audio/${file}`;
  console.log(`📤 正在上传 ${file} -> R2 (${r2Key})...`);
  try {
    const cmd = `npx wrangler r2 object put sunnybridge-textbooks/${r2Key} --file="${localPath}" --remote`;
    execSync(cmd, { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    console.log(`✅ ${file} 上传成功`);
  } catch (err) {
    console.error(`❌ ${file} 上传失败:`, err.message);
  }
}

console.log('🎉 全部音频已上传至 Cloudflare R2！');
