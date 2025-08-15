export function buildPrompt(
  role: "Researcher"|"Analyzer"|"Synthesizer"|"Author",
  traits: any, userMsg: string, topic?: string
) {
  const base = {
    Researcher: `Role: Researcher. Explore sources, discover info, cite where possible. Ask 1-2 follow-up questions.`,
    Analyzer: `Role: Analyzer. Evaluate critically. Identify risks, contradictions. Be concise.`,
    Synthesizer: `Role: Synthesizer. Connect ideas; produce a short synthesis.`,
    Author: `Role: Author. Organize clearly with headings and bullets.`
  }[role];

  const style = `Traits:
- Curiosity ${traits.curiosity ?? 0.5}
- Thoroughness ${traits.thoroughness ?? 0.5}
- Creativity ${traits.creativity ?? 0.5}
- Analytical ${traits.analytical ?? 0.5}
- Communication ${traits.communication ?? 0.5}
${role==="Author" ? `- Structure ${traits.structure ?? 0.5}
- Clarity ${traits.clarity ?? 0.5}
- Persuasiveness ${traits.persuasiveness ?? 0.5}`: ""}`;

  return `${base}
Topic: ${topic ?? "general"}
${style}

User message:
${userMsg}

Respond in Markdown.`;
}
