const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function testModel(modelName, apiKey) {
  console.log(`\nTesting ${modelName}...`);
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || 'nvapi-test'}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract vocabulary from this image. Output JSON.' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${tinyPng}` } },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${tinyPng}` } }
            ]
          }
        ],
        max_tokens: 50
      })
    });
    console.log(`${modelName} HTTP status:`, res.status);
    const body = await res.text();
    console.log(`${modelName} body:`, body.substring(0, 300));
  } catch (err) {
    console.error(`${modelName} error:`, err.message);
  }
}

async function main() {
  await testModel('meta/llama-3.2-11b-vision-instruct');
  await testModel('meta/llama-3.2-90b-vision-instruct');
  await testModel('qwen/qwen2.5-vl-72b-instruct');
  await testModel('google/deplot');
}

main();
