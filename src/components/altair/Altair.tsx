/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { useEffect, useRef, useState, memo } from "react";
import vegaEmbed from "vega-embed";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import {
  FunctionDeclaration,
  LiveServerToolCall,
  Modality,
  Type,
} from "@google/genai";

// 图表工具声明
const chartDeclaration: FunctionDeclaration = {
  name: "render_altair",
  description: "Displays an altair graph in json format.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      json_graph: {
        type: Type.STRING,
        description:
          "JSON STRING representation of the graph to render. Must be a string, not a json object",
      },
    },
    required: ["json_graph"],
  },
};

// 房间检查工具声明
const roomInspectionDeclaration: FunctionDeclaration = {
  name: "inspect_room",
  description: "Analyzes video feed to assess room cleanliness and tidiness.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      assessment: {
        type: Type.STRING,
        description: "Detailed assessment of room condition",
      },
      score: {
        type: Type.NUMBER,
        description: "Cleanliness score from 1-10",
      },
    },
    required: ["assessment", "score"],
  },
};

interface AltairProps {
  onRoomInspectionChange?: (hasRoomInspection: boolean) => void;
}

function AltairComponent({ onRoomInspectionChange }: AltairProps) {
  const [jsonString, setJSONString] = useState<string>("");
  const [roomResult, setRoomResult] = useState<{assessment: string; score: number} | null>(null);
  const { client, setConfig, setModel } = useLiveAPIContext();

  // Notify parent when room inspection state changes
  useEffect(() => {
    onRoomInspectionChange?.(!!roomResult);
  }, [roomResult, onRoomInspectionChange]);

  useEffect(() => {
    setModel("models/gemini-2.0-flash-exp");
    setConfig({
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      },
      systemInstruction: {
        parts: [
          {
            text: `You are a versatile AI assistant with multiple capabilities:
1. **Data Visualization**: When users ask for graphs, charts, or data visualization, call the "render_altair" function. Don't ask for additional information, make your best judgment.

2. **Room Inspection**: When users ask about room cleanliness, tidiness, or want to inspect a room, analyze the video feed and call the "inspect_room" function with your assessment.

3. **General Assistant**: For other queries, provide helpful responses and use Google Search when needed for current information.

Examples:
- "Show me a chart" → use render_altair
- "Inspect the room" → use inspect_room  
- "Is the room clean?" → use inspect_room
- "Display sales data" → use render_altair
- "What's the weather today?" → use googleSearch if needed`,
          },
        ],
      },
      tools: [
        { googleSearch: {} },
        { functionDeclarations: [chartDeclaration, roomInspectionDeclaration] },
      ],
    });
  }, [setConfig, setModel]);

  useEffect(() => {
    const onToolCall = (toolCall: LiveServerToolCall) => {
      if (!toolCall.functionCalls) {
        return;
      }
      
      // 处理图表渲染
      const chartFc = toolCall.functionCalls.find(
        (fc) => fc.name === chartDeclaration.name
      );
      if (chartFc) {
        const str = (chartFc.args as any).json_graph;
        setJSONString(str);
        setRoomResult(null); // 清除房间检查结果
      }
      
      // 处理房间检查
      const roomFc = toolCall.functionCalls.find(
        (fc) => fc.name === roomInspectionDeclaration.name
      );
      if (roomFc) {
        setRoomResult(roomFc.args as {assessment: string; score: number});
        setJSONString(""); // 清除图表
      }
      
      // 发送工具响应
      if (toolCall.functionCalls.length) {
        setTimeout(
          () =>
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls?.map((fc) => ({
                response: { output: { success: true } },
                id: fc.id,
                name: fc.name,
              })),
            }),
          200
        );
      }
    };
    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client]);

  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (embedRef.current && jsonString) {
      console.log("jsonString", jsonString);
      vegaEmbed(embedRef.current, JSON.parse(jsonString));
    }
  }, [embedRef, jsonString]);

  return (
    <div className="unified-assistant">
      {/* Chart rendering area */}
      {jsonString && <div className="vega-embed" ref={embedRef} />}
      
      {/* Room inspection result area */}
      {roomResult && (
        <div className="room-inspector" style={{
          maxWidth: '600px', // Reduced from 800px
          padding: '20px'
        }}>
          <div style={{
            padding: '24px',
            margin: '20px 0'
          }}>
            <h3 style={{
              margin: '0 0 20px 0',
              fontSize: '20px',
              color: '#fff'  // Changed to white
            }}>🏠 Room Inspection Result</h3>
            <div style={{
              padding: '24px', 
              background: '#f8f9fa', 
              borderRadius: '12px', 
              margin: '20px 0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: '1px solid #e9ecef'
            }}>
              <div style={{
                fontSize: '28px', 
                fontWeight: 'bold', 
                marginBottom: '16px',
                color: roomResult.score >= 7 ? '#28a745' : roomResult.score >= 5 ? '#ffc107' : '#dc3545',
                textAlign: 'center'
              }}>
                Score: {roomResult.score}/10
              </div>
              <p style={{
                fontSize: '16px',
                lineHeight: '1.6',
                color: '#222',  // Changed from #555 to #222 for brighter text
                margin: '0',
                padding: '12px 0'
              }}>{roomResult.assessment}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* 默认状态 */}
      {!jsonString && !roomResult && (
        <div
          style={{
            padding: "40px 20px",
            background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)",
            borderRadius: "20px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            maxWidth: "400px",
            textAlign: 'center',
          }}
        >
          <div style={{
            marginBottom: '16px'
          }}>
            <span style={{
              fontSize: '48px',
              display: 'block',
              marginBottom: '12px',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
            }}>🤖</span>
            <h2 style={{
              fontSize: '28px',
              margin: '0',
              color: '#fff',
              fontWeight: '600',
              letterSpacing: '0.5px',
              textShadow: '0 2px 4px rgba(0,0,0,0.5)'
            }}>Am I Done?</h2>
          </div>
          <p style={{
            color: 'rgba(255,255,255,0.8)',
            fontSize: '16px',
            margin: '0',
            fontWeight: '400',
            lineHeight: '1.5'
          }}>Ask me to inspect rooms!</p>
        </div>
      )}
    </div>
  );
}

export const Altair = memo(AltairComponent);
