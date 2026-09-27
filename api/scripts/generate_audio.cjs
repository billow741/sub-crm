const fs = require('fs');
const path = require('path');

const DAILY_SPARKS = [
  { id: 'spark_001', en: 'Every small step makes a big adventure!' },
  { id: 'spark_002', en: 'Mistakes are proof that you are trying!' },
  { id: 'spark_003', en: 'Practice brings progress, not just perfection!' },
  { id: 'spark_004', en: 'Look closely at the stars, they are whispering!' },
  { id: 'spark_005', en: 'Kind words are like sunshine on a rainy day.' },
  { id: 'spark_006', en: 'Ask a question, and the whole world opens up!' },
  { id: 'spark_007', en: 'Good morning, sunshine! Today is full of magic.' },
  { id: 'spark_008', en: 'You are braver than you believe and stronger than you seem.' },
  { id: 'spark_009', en: 'Sing like birds, speak like friends, dream like kings!' },
  { id: 'spark_010', en: 'An open book is an open door to anywhere!' },
  { id: 'spark_011', en: 'Together, we can build castles in the sky.' },
  { id: 'spark_012', en: 'A warm smile is the universal language of kindness.' },
  { id: 'spark_013', en: "Don't just fly, soar high into the clouds!" },
  { id: 'spark_014', en: 'Every autumn leaf whispers a tale of change.' },
  { id: 'spark_015', en: 'I am curious, I am kind, and I love to learn!' }
];

async function run() {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const outputDir = path.join(__dirname, '../../../sub-weapp/src/assets/audio');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`🎙️ 开始生成 15 段微软 Neural 美式少儿原声音频...`);

  for (const item of DAILY_SPARKS) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata('en-US-AnaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const filePath = path.join(outputDir, `${item.id}.mp3`);

    await new Promise((resolve, reject) => {
      const { audioStream } = tts.toStream(item.en);
      const writeStream = fs.createWriteStream(filePath);
      audioStream.pipe(writeStream);
      writeStream.on('finish', () => {
        const stats = fs.statSync(filePath);
        console.log(`✅ [${item.id}.mp3] (${stats.size} B): "${item.en}"`);
        resolve();
      });
      writeStream.on('error', reject);
      audioStream.on('error', reject);
    });
  }

  console.log('🎉 15 段高品质原声音频已全部生成到 sub-weapp/src/assets/audio/！');
}

run().catch(err => {
  console.error('❌ 生成失败:', err);
  process.exit(1);
});
