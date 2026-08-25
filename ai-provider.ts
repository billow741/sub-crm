export default function (pi: ExtensionAPI) {
  pi.registerProvider("agentrouter-openai", {
    name: "AgentRouter openai",
    baseUrl: "https://agentrouter.org/v1",
    apiKey: "sk-6tFKDVJyMQbAYqQZtdVp92QNqtBhk1nWQNCwk0HSOsDpRdSR",
    api: "OpenAI Compatible",
    models: [
      {
        id: "gpt-5.5/glm-5.2",
        name: "GPT-5.5/GLM-5.2",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 8192
      }
    ]
  });
}