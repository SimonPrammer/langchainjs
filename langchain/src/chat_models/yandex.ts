import { CallbackManagerForLLMRun } from "../callbacks/manager.js";
import { YandexGPTInputs } from "../llms/yandex.js";
import {
  AIMessage,
  BaseMessage,
  ChatResult,
  ChatGeneration,
} from "../schema/index.js";
import { getEnvironmentVariable } from "../util/env.js";
import { BaseChatModel } from "./base.js";

const apiUrl = "https://llm.api.cloud.yandex.net/llm/v1alpha/chat";

interface ParsedMessage {
  role: string;
  text: string;
}

function _parseChatHistory(history: BaseMessage[]): [ParsedMessage[], string] {
  const chatHistory: ParsedMessage[] = [];
  let instruction = "";

  for (const message of history) {
    if ("content" in message) {
      if (message._getType() === "human") {
        chatHistory.push({ role: "user", text: message.content });
      } else if (message._getType() === "ai") {
        chatHistory.push({ role: "assistant", text: message.content });
      } else if (message._getType() === "system") {
        instruction = message.content;
      }
    }
  }

  return [chatHistory, instruction];
}

export class ChatYandexGPT extends BaseChatModel {
  apiKey?: string;

  iamToken?: string;

  temperature = 0.6;

  maxTokens = 1700;

  model = "general";

  constructor(fields?: YandexGPTInputs) {
    super(fields ?? {});

    const apiKey = fields?.apiKey ?? getEnvironmentVariable("YC_API_KEY");

    const iamToken = fields?.iamToken ?? getEnvironmentVariable("YC_IAM_TOKEN");

    if (apiKey === undefined && iamToken === undefined) {
      throw new Error(
        "Please set the YC_API_KEY or YC_IAM_TOKEN environment variable or pass it to the constructor as the apiKey or iamToken field."
      );
    }

    this.apiKey = apiKey;
    this.iamToken = iamToken;
    this.maxTokens = fields?.maxTokens ?? this.maxTokens;
    this.temperature = fields?.temperature ?? this.temperature;
    this.model = fields?.model ?? this.model;
  }

  _llmType() {
    return "yandexgpt";
  }

  _combineLLMOutput?() {
    return {};
  }

  /** @ignore */
  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    _?: CallbackManagerForLLMRun | undefined
  ): Promise<ChatResult> {
    const [messageHistory, instruction] = _parseChatHistory(messages);
    const headers = { "Content-Type": "application/json", Authorization: "" };
    if (this.apiKey !== undefined) {
      headers.Authorization = `Api-Key ${this.apiKey}`;
    } else {
      headers.Authorization = `Bearer ${this.iamToken}`;
    }
    const bodyData = {
      model: this.model,
      generationOptions: {
        temperature: this.temperature,
        maxTokens: this.maxTokens,
      },
      messages: messageHistory,
      instructionText: instruction,
    };
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyData),
      signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${apiUrl} from YandexGPT: ${response.status}`
      );
    }
    const responseData = await response.json();
    const { result } = responseData;
    const { text } = result.message;
    const totalTokens = result.num_tokens;
    const generations: ChatGeneration[] = [
      { text, message: new AIMessage(text) },
    ];

    return {
      generations,
      llmOutput: { totalTokens },
    };
  }
}
