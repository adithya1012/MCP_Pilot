import { ChatInput } from "@/components/custom/chatinput";
import {
  PreviewMessage,
  ThinkingMessage,
} from "../../components/custom/message";
import { useScrollToBottom } from "@/components/custom/use-scroll-to-bottom";
import { useState, useRef } from "react";
import { message } from "../../interfaces/interfaces";
import { Overview } from "@/components/custom/overview";
import { Header } from "@/components/custom/header";
import { v4 as uuidv4 } from "uuid";
import { IntegrationManager } from "../../integrationManager";

const manager = new IntegrationManager();
await manager.loadManifests("/integrations/integration.yaml");

const integrations = manager.getIntegrations();
console.log("Integrations:", integrations);

// console.log("Active integrations:", integrations.integrations);

const socket = new WebSocket("ws://localhost:8090"); //change to your websocket endpoint
export function Chat() {
  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();
  const [messages, setMessages] = useState<message[]>([]);
  const [question, setQuestion] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isNewTask = useRef(true); // Used useRef to avoid the rerender when we change the value to False. But i see that useState is still working.

  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(
    null
  );

  const cleanupMessageHandler = () => {
    if (messageHandlerRef.current && socket) {
      socket.removeEventListener("message", messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
  };

  async function handleSubmit(text?: string) {
    if (!socket || socket.readyState !== WebSocket.OPEN || isLoading) return;

    const messageText = text || question;
    setIsLoading(true);
    cleanupMessageHandler();

    const traceId = uuidv4();
    setMessages((prev) => [
      ...prev,
      { content: messageText, role: "user", id: traceId },
    ]);
    // Here we are sending the data to the backend.
    // const payload = {
    //   message: messageText,
    //   newTask: isNewTask.current,
    //   integrations: integrations,
    // };
    const payload = messageText;
    socket.send(JSON.stringify(payload));
    isNewTask.current = false;
    setQuestion("");

    try {
      const messageHandler = (event: MessageEvent) => {
        setIsLoading(false);
        if (event.data.includes("[END]")) {
          return;
        }

        let content = event.data;
        try {
          const parsed = JSON.parse(event.data);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "data" in parsed
          ) {
            content = parsed.data;
          }
        } catch (e) {
          console.error("The Error: ", e);
          // Not JSON, use as is
        }

        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          const newContent =
            lastMessage?.role === "assistant"
              ? lastMessage.content + content
              : content;

          const newMessage = {
            content: newContent,
            role: "assistant",
            id: traceId,
          };
          return lastMessage?.role === "assistant"
            ? [...prev.slice(0, -1), newMessage]
            : [...prev, newMessage];
        });

        if (event.data.includes("[END]")) {
          cleanupMessageHandler();
        }
      };

      messageHandlerRef.current = messageHandler;
      socket.addEventListener("message", messageHandler);
    } catch (error) {
      console.error("WebSocket error:", error);
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <Header />
      <div
        className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
        ref={messagesContainerRef}
      >
        {messages.length == 0 && <Overview />}
        {messages.map((message, index) => (
          <PreviewMessage key={index} message={message} />
        ))}
        {isLoading && <ThinkingMessage />}
        <div
          ref={messagesEndRef}
          className="shrink-0 min-w-[24px] min-h-[24px]"
        />
      </div>
      <div className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <ChatInput
          question={question}
          setQuestion={setQuestion}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
