export interface PromptDirectives {
  isStudyIntent: boolean;
  wantsVisualHelp: boolean;
  wantsImageStudioRedirect: boolean;
  wantsDetailedNotes: boolean;
  wantsSourceGrounding: boolean;
  isCreativeTask: boolean;
  isCodeTask: boolean;
  isFrontendWebCodeTask: boolean;
  isConversational: boolean;
  isReasoningTask: boolean;
  isComparisonTask: boolean;
  isMathTask: boolean;
  isTranslationTask: boolean;
  lines: string[];
}

export function getPromptDirectives(query: string): PromptDirectives {
  const lowerQuery = query.toLowerCase();
  const wordCount = query.split(/\s+/).length;

  const isStudyIntent = /\b(study|learn|revision|exam|notes|master|understand|memorize|recall|productivity|focus|prepare|quiz|flashcard|practice)\b/.test(lowerQuery);
  const wantsVisualHelp = /\b(image|diagram|chart|mind map|visual|illustration|show me|draw|graph|flowchart|table|matrix)\b/.test(lowerQuery);
  const wantsImageStudioRedirect = /\b(image generation|generate images?|make an? image|create an? image|image studio|img studio|generate artwork|text to image|text-to-image|image prompt|draw me|create artwork)\b/.test(lowerQuery);
  const wantsDetailedNotes = /\b(in detail|detailed|comprehensive|deep dive|full analysis|step by step|prepare notes|detailed notes|long answer|thorough|complete guide|everything about|elaborate|in-depth|extensive|exhaustive)\b/.test(lowerQuery);
  const wantsSourceGrounding = /\b(source|sources|citation|citations|cite|verify|fact check|fact-check|wikipedia|wiki|reference|proof|evidence|according to)\b/.test(lowerQuery);
  const isCreativeTask = /\b(write|create|compose|generate|draft|poem|story|essay|letter|email|blog|article|script|lyrics|brainstorm|ideate)\b/.test(lowerQuery);
  const isCodeTask = /\b(code|function|implement|fix|bug|refactor|debug|program|script|api|component|class|module|build|develop|syntax|error|compile|deploy)\b/.test(lowerQuery);
  const isFrontendWebCodeTask = /\b(html|css|javascript|js|jsx|tsx|web page|webpage|landing page|website|frontend|ui|ui\/?ux|responsive|single file|one file|combined file|embed(?:ded)? css|embed(?:ded)? js)\b/.test(lowerQuery);
  const isReasoningTask = /\b(why|how does|how do|explain why|reason|logic|deduce|infer|prove|cause|because|consequence|implication|therefore)\b/.test(lowerQuery);
  const isComparisonTask = /\b(compare|contrast|difference|versus|vs\.?|better|worse|pros and cons|advantages|disadvantages|trade.?off|which is)\b/.test(lowerQuery);
  const isMathTask = /\b(calculate|compute|solve|equation|formula|integral|derivative|algebra|geometry|probability|statistics|matrix|vector)\b/.test(lowerQuery);
  const isTranslationTask = /\b(translate|translation|in (spanish|french|german|hindi|arabic|chinese|japanese|korean|portuguese|italian|russian|malayalam|tamil|telugu|bengali))\b/.test(lowerQuery);
  const isConversational = wordCount < 8 && !wantsDetailedNotes && !isCodeTask && !isMathTask;

  const lines: string[] = [];

  if (isStudyIntent) {
    lines.push(
      "- The user is studying. Respond like a study coach: explain clearly, summarize key points, add a quick recall check, and propose a next 10-minute task."
    );
  }

  if (wantsVisualHelp) {
    lines.push(
      "- Visual aids requested. Include a 'Visual Aids' section with relevant diagram descriptions, ASCII art, or markdown tables to illustrate concepts."
    );
  }

  if (wantsImageStudioRedirect) {
    lines.push(
      "- The user wants image generation. Do not describe the workflow. Instead, respond briefly with a single CTA link button to the Image Studio: [Go to Image Studio](/imagine). Keep any extra text minimal and friendly."
    );
  }

  if (wantsDetailedNotes) {
    lines.push(
      "- The user asked for detailed notes. Provide a long-form, structured response with: overview, key concepts, worked examples, edge cases, and a concise recap checklist. Do NOT be brief."
    );
  }

  if (wantsSourceGrounding) {
    lines.push(
      "- The user asked for verifiable information. Ground the answer in explicit sources and include at least 2 citations. Prefer authoritative references (Wikipedia for foundational background, then primary or official sources for current details)."
    );
  }

  if (isCreativeTask) {
    lines.push(
      "- This is a creative task. Be breathtakingly imaginative, beautifully structured, and highly polished. Match the tone the user expects (formal, casual, poetic, etc.) flawlessly."
    );
  }

  if (isCodeTask) {
    lines.push(
      "- This is a coding task. Provide world-class, production-ready, flawlessly commented code with robust error handling. If the user says 'give code', lead with the code and avoid extra explanation unless they ask for it."
    );
  }

  if (isFrontendWebCodeTask) {
    lines.push(
      "- This is frontend/web code. Default to a single combined HTML file with embedded CSS and JavaScript unless the user explicitly asks for separate files. Ensure the design is highly modern, accessible, and visually stunning. For HTML and Markdown previews, render the page-like preview instead of only showing raw code when preview is requested."
    );
  }

  if (isReasoningTask && !isCodeTask) {
    lines.push(
      "- This requires rigorous reasoning. Break down your logic step-by-step. Show a brilliant chain of thought. Explicitly state assumptions and validate conclusions definitively."
    );
  }

  if (isComparisonTask) {
    lines.push(
      "- The user wants a comparison. Use a structured format: side-by-side analysis, clear criteria, and a recommendation if appropriate. Tables work well here."
    );
  }

  if (isMathTask) {
    lines.push(
      "- This is a math/calculation task. Show all work step-by-step. Use LaTeX-style formatting for equations. Double-check your arithmetic. State the final answer clearly."
    );
  }

  if (isTranslationTask) {
    lines.push(
      "- Translation requested. Provide the translation clearly, with pronunciation guide if helpful. Note any nuances or alternative translations."
    );
  }

  if (isConversational && !isStudyIntent && !wantsDetailedNotes) {
    lines.push(
      "- This appears to be a casual message. Respond naturally and conversationally, but still be helpful."
    );
  }

  return { isStudyIntent, wantsVisualHelp, wantsImageStudioRedirect, wantsDetailedNotes, wantsSourceGrounding, isCreativeTask, isCodeTask, isFrontendWebCodeTask, isConversational, isReasoningTask, isComparisonTask, isMathTask, isTranslationTask, lines };
}
