
import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";
import { ReadbackFeedback, LanguageCode, SUPPORTED_LANGUAGES, PilotVoiceName, AtcVoiceName, ConversationEntry, FlightPlan, TrainingScenario } from "../types";

// --- Audio Decoding/Encoding Helpers ---

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const getApiKey = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY is missing in process.env");
    throw new Error("API_KEY is missing");
  }
  return apiKey;
};

// Cache to store generated speech audio bytes
const speechCache = new Map<string, Uint8Array>();

export async function generateReadback(
  atcText: string, 
  callsign: string, 
  language: LanguageCode = 'en-US',
  history: ConversationEntry[] = []
): Promise<{ primary: string; alternatives: string[], confidence: number }> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  const historyText = history.map(h => `${h.speaker}: ${h.text}`).join('\n');

  const prompt = `
    You are an expert airline pilot.
    Task: specific pilot read-back for the following ATC instruction.
    Context History:
    ${historyText}

    Current ATC Instruction: "${atcText}"
    Your Callsign: "${callsign}"
    Language: ${SUPPORTED_LANGUAGES[language]}

    Rules:
    1. STRICTLY follow ICAO/FAA standard phraseology.
    2. Include ONLY the read-back. No conversational filler.
    3. End with the callsign.
    4. If the instruction contains numbers (headings, altitudes, frequencies), they MUST be read back exactly.
    5. If the instruction is a question or traffic advisory, answer appropriately.
    6. Calculate a confidence score (0.0 to 1.0) representing your certainty that this is the correct standard phraseology.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          readback: { type: Type.STRING },
          alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
          confidence: { type: Type.NUMBER, description: "Confidence score between 0.0 and 1.0" }
        },
        required: ["readback", "alternatives", "confidence"]
      }
    }
  });

  const json = JSON.parse(response.text || '{}');
  return {
    primary: json.readback || "Say again?",
    alternatives: json.alternatives || [],
    confidence: json.confidence || 0.0
  };
}

export async function checkReadbackAccuracy(
  atcText: string,
  pilotText: string,
  language: LanguageCode = 'en-US',
  history: ConversationEntry[] = [],
  expectedReadback?: string,
  diversityMode: boolean = false
): Promise<ReadbackFeedback> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const historyText = history.map(h => `${h.speaker}: ${h.text}`).join('\n');
  
  // Enhanced diversity instructions
  const diversityInstructions = diversityMode 
    ? `
      CRITICAL DIVERSITY & ACCENT PROTOCOL:
      - You are evaluating a pilot who may speak English as a second language or have a strong accent.
      - CORE TASK: Differentiate between harmless phonetic variations and safety-critical operational errors.
      - TOLERANCE RULES:
        1. PHONETIC/ACCENT VARIATIONS: (e.g., "Tree" vs "Three", vowel shifts, choppy cadence, non-native intonation). IGNORE these if the semantic meaning and numbers are correct. Mark as CORRECT.
        2. OPERATIONAL ERRORS: (e.g., Wrong altitude, wrong heading, wrong frequency, missing 'Cleared', incorrect callsign). Mark as INCORRECT.
      - FEEDBACK GUIDANCE:
        - Focus strictly on flight safety elements.
        - Do not critique pronunciation unless it creates dangerous ambiguity.
        - Ensure feedback is encouraging and supportive.
      ` 
    : `
      - Allow for standard aviation variations (e.g., "tree" for "three").
      - Focus on operational accuracy (numbers, clearances).
      `;

  const prompt = `
    You are an Agentic AI Flight Instructor acting as a CFI, CFII, and MEI.
    Task: Evaluate the accuracy of the pilot's read-back based on FAA/ICAO standards.

    ${diversityInstructions}

    Context History:
    ${historyText}

    ATC Instruction: "${atcText}"
    ${expectedReadback ? `Expected Standard Read-back (Ground Truth): "${expectedReadback}"` : ''}
    Pilot Actual Read-back: "${pilotText}"
    Language: ${SUPPORTED_LANGUAGES[language]}

    Your Role & Objectives:
    1. **Agentic Instructor Persona**: You are an experienced instructor (CFI/CFII/MEI). Your feedback should be authoritative yet supportive, demonstrating deep knowledge of VFR, IFR, and Multi-Engine procedures.
    2. **Precision Analysis**:
       - Verify all mandatory read-back items (Clearances, Headings, Altitudes, Frequencies, Transponder Codes).
       - Check for correct standard phraseology (e.g., "Climb and maintain" vs "Climb to").
       - Verify callsign usage.
    3. **Operational Context**:
       - If the instruction involves an instrument procedure (ILS, Holding, etc.), evaluate as a CFII (focus on procedure integrity).
       - If it involves engine-out or multi-engine ops, evaluate as an MEI (focus on safety and aircraft control implications).
    
    Compare specifically against the "${expectedReadback ? 'Expected Standard Read-back' : 'ATC Instruction'}" to determine correctness.

    Return a JSON object.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          accuracy: { type: Type.STRING, enum: ["CORRECT", "INCORRECT"] },
          accuracyScore: { type: Type.NUMBER, description: "Score from 0.0 to 1.0" },
          feedbackSummary: { type: Type.STRING, description: "A concise, spoken-style summary of the feedback (max 2 sentences) optimized for Text-to-Speech. If CORRECT, provide positive reinforcement (e.g., 'Good readback', 'Spot on'). If INCORRECT, briefly explain why." },
          detailedFeedback: { type: Type.STRING },
          correctPhraseology: { type: Type.STRING },
          phraseAnalysis: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                phrase: { type: Type.STRING },
                status: { type: Type.STRING, enum: ["correct", "acceptable_variation", "incorrect"] },
                explanation: { type: Type.STRING }
              }
            }
          },
          commonPitfalls: { type: Type.STRING },
          furtherReading: { type: Type.STRING }
        },
        required: ["accuracy", "accuracyScore", "feedbackSummary", "detailedFeedback", "correctPhraseology", "phraseAnalysis"]
      }
    }
  });

  const json = JSON.parse(response.text || '{}');
  return json as ReadbackFeedback;
}

export async function extractCallsign(
  text: string, 
  language: LanguageCode,
  history: ConversationEntry[] = []
): Promise<string | null> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const historyText = history.map(h => `${h.speaker}: ${h.text}`).join('\n');

  const prompt = `
    Extract the *aircraft* callsign from the text below.
    Text: "${text}"
    History:
    ${historyText}
    Language: ${SUPPORTED_LANGUAGES[language]}

    Rules:
    1. Identify the target aircraft callsign (e.g., "November 123 Alpha Bravo", "United 454", "Speedbird 10").
    2. Convert it to standard alphanumeric format (e.g., "N123AB", "UAL454", "BAW10").
    3. IGNORE ATC facility callsigns (e.g., "Boston Tower", "Logan Ground", "New York Approach", "Center").
    4. If NO aircraft callsign is found, or if the text only contains ATC facility names, return null.
    5. Be smart about abbreviations if context allows.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          callsign: { type: Type.STRING, nullable: true }
        }
      }
    }
  });

  const json = JSON.parse(response.text || '{}');
  return json.callsign;
}

export async function generateSpeech(text: string, voice: PilotVoiceName | AtcVoiceName): Promise<Uint8Array | null> {
    const cacheKey = `${voice}:${text}`;
    if (speechCache.has(cacheKey)) {
        return speechCache.get(cacheKey)!;
    }

    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    // Handle voice keys with suffixes (e.g. "Fenrir_USEast", "Puck_UK")
    let voiceName = voice;
    let textToSpeak = text;
    
    // Extract base voice name (e.g. "Puck" from "Puck_UK")
    const [baseVoice] = voice.split('_');
    
    if (baseVoice && ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].includes(baseVoice)) {
        voiceName = baseVoice as PilotVoiceName | AtcVoiceName;
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: { parts: [{ text: textToSpeak }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voiceName },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const audioBytes = decode(base64Audio);
            speechCache.set(cacheKey, audioBytes);
            return audioBytes;
        }
        return null;
    } catch (error) {
        console.error("TTS generation failed:", error);
        return null;
    }
}

export async function generateScenarioFromFlightPlan(
  flightPlan: FlightPlan, 
  callsign: string
): Promise<TrainingScenario> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const prompt = `
    You are an expert Air Traffic Controller.
    Generate a realistic initial ATC clearance scenario based on the following flight plan:
    
    Callsign: ${callsign}
    Origin: ${flightPlan.origin}
    Destination: ${flightPlan.destination}
    Route: ${flightPlan.route || "As filed"}
    Aircraft: ${flightPlan.aircraftType}
    Altitude: ${flightPlan.cruisingAltitude}
    Rules: ${flightPlan.flightRules}

    Task:
    1. Create a realistic "Clearance Delivery" or "Ground" instruction (e.g., IFR clearance, Taxi to active) relevant to the origin airport if known, or generic standard format.
    2. Determine the standard "Expected Pilot Readback" for this instruction.
    3. Ensure the clearance matches the Flight Rules (IFR vs VFR).

    Return JSON:
    {
      "title": "Short descriptive title (e.g. IFR Clearance to KJFK)",
      "description": "Brief description of the scenario",
      "atcInstruction": "The full spoken text of the clearance",
      "expectedReadback": "The correct full readback"
    }
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          atcInstruction: { type: Type.STRING },
          expectedReadback: { type: Type.STRING }
        },
        required: ["title", "description", "atcInstruction", "expectedReadback"]
      }
    }
  });

  const json = JSON.parse(response.text || '{}');
  
  return {
    id: `flight-plan-${Date.now()}`,
    category: 'Flight Plan Generated',
    title: json.title,
    description: json.description,
    atcInstruction: json.atcInstruction,
    expectedReadback: json.expectedReadback,
    isCustom: true
  };
}

export async function connectToLive(
    onInterim: (text: string, confidence?: number) => void,
    onFinal: (text: string, confidence?: number) => void,
    onError: (error: any) => void,
    languageCode: LanguageCode,
    mode: 'atc' | 'pilot' = 'atc',
    diversityMode: boolean = false
): Promise<any> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    let lastInterimText = "";
    
    const aviationContext = `
      You are an expert Aviation Transcriber with advanced predictive text capabilities.
      Domain: Air Traffic Control (ATC) and Pilot Communications.
      
      CORE OBJECTIVE: Output complete, coherent, and grammatically correct aviation phrases.
      
      Advanced Processing Rules:
      1. **Smart Reconstruction**: actively guess and complete cut-off words based on aviation context (e.g., "al...tude" -> "altitude", "u...ted" -> "United").
      2. **Word Integrity**: NEVER output broken words or fragmented syllables with spaces (e.g., correct "land ing" to "landing", "t ax i" to "taxi").
      3. **Phrase Continuity**: Ensure the transcribed text flows logically as a standard ATC command or read-back.
      
      Knowledge Base:
      - ICAO Phonetics: Alpha, Bravo, Charlie, Delta, Echo, Foxtrot, Golf, Hotel, India, Juliett, Kilo, Lima, Mike, November, Oscar, Papa, Quebec, Romeo, Sierra, Tango, Uniform, Victor, Whiskey, X-ray, Yankee, Zulu.
      - Aviation Numbers: "Tree" (3), "Fife" (5), "Niner" (9), "Thousand", "Hundred".
      - Critical Jargon: Squawk, Ident, ILS, VOR, Hold Short, Cleared, Runway, Taxi, Flight Level, Altimeter, Approach, Center, Tower, Ground, Localizer, Radial, Vectors, Direct.
      
      Standard Instructions:
      - Accurately transcribe all numbers (altitudes, headings, frequencies, squawk codes).
      - Recognize standard callsign formats (N-numbers, Airline callsigns).
      - Ignore background cockpit noise or static.
      ${diversityMode ? '- DIVERSITY MODE ACTIVE: Apply logic to normalize diverse accents and non-native pronunciations. Focus on extracting the semantic aviation intent over strict phonetic matching.' : ''}
      ${mode === 'pilot' ? '- Focus on pilot read-back phraseology (e.g., "Roger", "Wilco", repeating instructions).' : '- Focus on ATC instruction phraseology (e.g., "Cleared to", "Turn left", "Contact").'}
    `;

    const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
            systemInstruction: `${aviationContext}\nLanguage: ${SUPPORTED_LANGUAGES[languageCode]}`,
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
        },
        callbacks: {
            onopen: () => {
                console.log("Live session connected");
            },
            onmessage: (message: LiveServerMessage) => {
                const transcription = message.serverContent?.inputTranscription;
                if (transcription) {
                    const text = transcription.text;
                    if (text) {
                        lastInterimText = text;
                        onInterim(text, 0.9);
                    }
                }
                
                if (message.serverContent?.turnComplete) {
                     if (lastInterimText.trim().length > 0) {
                         console.log("Turn complete detected. Finalizing:", lastInterimText);
                         onFinal(lastInterimText.trim(), 0.9);
                         lastInterimText = "";
                     }
                }
            },
            onerror: (error: any) => {
                onError(error);
            },
            onclose: () => {
                console.log("Live session closed");
            },
        },
    });
    
    return session;
}