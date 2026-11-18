export default {
  init(sdk) {
    console.log("[Smart Composer Addon] Initialized with config:", sdk.config);

    let wasmInstance = null;
    let wasmMemory = null;
    let transformersPipeline = null;
    let isModelLoading = false;

    // 1. Local WASM Module Loader (Fast / Offline)
    async function loadWasm() {
      if (wasmInstance) return wasmInstance;
      try {
        const wasmUrl = sdk.assetUrl("generator.wasm");
        const resp = await fetch(wasmUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const bytes = await resp.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(bytes, {});
        wasmInstance = instance;
        wasmMemory = instance.exports.memory;
        return wasmInstance;
      } catch (err) {
        console.warn("[Smart Composer] WASM loading fallback:", err);
        return null;
      }
    }

    // Preload WASM
    loadWasm();

    // 2. Transformers.js Pipeline Loader (Client Neural Model)
    async function loadTransformers(onProgress) {
      if (transformersPipeline) return transformersPipeline;
      if (isModelLoading) return null;

      try {
        isModelLoading = true;
        // Dynamically import Transformers.js from CDN
        const { pipeline, env } = await import(
          /* @vite-ignore */ "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3"
        );

        env.allowLocalModels = false;

        // Select neural model: Qwen 2.5 0.5B (default) or SmolLM2 135M
        const modelId = sdk.config?.model?.includes("SmolLM2")
          ? "HuggingFaceTB/SmolLM2-135M-Instruct"
          : "onnx-community/Qwen2.5-0.5B-Instruct";

        transformersPipeline = await pipeline("text-generation", modelId, {
          dtype: "q4",
          progress_callback: (p) => {
            if (typeof onProgress === "function" && p.status === "progress") {
              onProgress(Math.round(p.progress || 0));
            }
          },
        });
        isModelLoading = false;
        return transformersPipeline;
      } catch (err) {
        isModelLoading = false;
        console.warn("[Smart Composer] Transformers.js loading unavailable, using local WASM:", err);
        return null;
      }
    }

    const TONE_MAP = {
      Professional: 0,
      Friendly: 1,
      Concise: 2,
      Urgent: 3,
      Formal: 4,
      Casual: 5,
    };

    const LENGTH_MAP = {
      Standard: 0,
      Concise: 1,
      Detailed: 2,
    };

    // Fast Local WASM Generation
    async function generateWithWasm(prompt, toneName, lengthName) {
      const toneCode = TONE_MAP[toneName] ?? 0;
      const lengthCode = LENGTH_MAP[lengthName] ?? 0;
      const inst = await loadWasm();

      if (inst && inst.exports.generate_draft && inst.exports.alloc && wasmMemory) {
        try {
          const encoder = new TextEncoder();
          const encoded = encoder.encode(prompt);
          const promptPtr = inst.exports.alloc(encoded.length);
          new Uint8Array(wasmMemory.buffer, promptPtr, encoded.length).set(encoded);

          const outLenPtr = inst.exports.alloc(4);
          const resultPtr = inst.exports.generate_draft(
            promptPtr,
            encoded.length,
            toneCode,
            lengthCode,
            outLenPtr
          );

          const outLenView = new DataView(wasmMemory.buffer, outLenPtr, 4);
          const outLen = outLenView.getUint32(0, true);

          const resultBytes = new Uint8Array(wasmMemory.buffer, resultPtr, outLen);
          const decoder = new TextDecoder();
          const text = decoder.decode(resultBytes);

          inst.exports.dealloc(promptPtr, encoded.length);
          inst.exports.dealloc(outLenPtr, 4);
          inst.exports.dealloc(resultPtr, outLen);

          return text;
        } catch (e) {
          console.warn("[Smart Composer] WASM execution error:", e);
        }
      }

      // Pure JS fallback
      return fallbackSynthesis(prompt, toneCode, lengthCode);
    }

    function fallbackSynthesis(prompt, toneCode, lengthCode) {
      const p = prompt.trim();
      const isUrgent = toneCode === 3;
      const isFriendly = toneCode === 1 || toneCode === 5;
      const isFormal = toneCode === 4;

      let greeting = "Hello,";
      if (isFormal) greeting = "Dear Team,";
      else if (isFriendly) greeting = "Hi there,";

      let signoff = "Best regards,";
      if (toneCode === 1) signoff = "Warmly,";
      else if (toneCode === 2) signoff = "Thanks,";
      else if (toneCode === 3) signoff = "Regards,";
      else if (toneCode === 4) signoff = "Sincerely,";
      else if (toneCode === 5) signoff = "Cheers,";

      if (lengthCode === 1 || toneCode === 2) {
        return `${greeting}\n\nI am writing regarding ${p}. Please let me know your thoughts and availability so we can proceed.\n\n${signoff}`;
      }

      if (lengthCode === 2) {
        return `${greeting}\n\nI hope you are having a productive week.\n\nI am reaching out to provide complete context regarding ${p}.\n\nKey Highlights:\n- Overview: Reviewing requirements and deliverables aligned with our target schedule.\n- Key Objective: Ensure all stakeholder questions are addressed proactively.\n- Next Action: Finalize discussion points and schedule a brief sync to confirm next steps.\n\nPlease review at your convenience and let me know if you would like any adjustments.\n\n${signoff}`;
      }

      if (isUrgent) {
        return `${greeting}\n\nI am writing to urgently follow up regarding ${p}. We need to align on this promptly.\n\nPlease review the details and let me know your feedback as soon as possible.\n\n${signoff}`;
      }

      if (isFriendly) {
        return `${greeting}\n\nHope all is well on your end.\n\nJust wanted to reach out regarding ${p}. Whenever you get a chance, let me know your thoughts.\n\nLooking forward to catching up soon.\n\n${signoff}`;
      }

      return `${greeting}\n\nI hope this email finds you well.\n\nI am writing regarding ${p}. I wanted to share this with you and gather your thoughts on how best to proceed.\n\nPlease let me know if you have any questions or if you would like to schedule a quick call.\n\n${signoff}`;
    }

    // Modal Manager
    let modalEl = null;

    function createModal() {
      if (modalEl) return modalEl;

      const overlay = document.createElement("div");
      overlay.id = "smart-composer-modal-overlay";
      overlay.className =
        "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm transition-opacity";
      overlay.style.display = "none";

      overlay.innerHTML = `
        <div class="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 text-slate-900 dark:text-slate-100 max-h-[92vh] overflow-y-auto">
          <!-- Header -->
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 class="text-sm font-bold tracking-tight">Smart Email Composer</h3>
                <div class="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400" id="smart-engine-badge">
                  <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Client-Side Local Model</span>
                </div>
              </div>
            </div>
            <button type="button" id="smart-modal-close-btn" class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Close (Esc)">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Quick Starters (Clean Text Pills) -->
          <div>
            <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
              Quick Starters
            </div>
            <div class="flex flex-wrap gap-1.5" id="smart-quick-starters">
              <button type="button" class="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 transition-colors" data-prompt="Follow up on the project proposal sent last week, asking if there are any questions or feedback.">
                Proposal Follow-up
              </button>
              <button type="button" class="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 transition-colors" data-prompt="Schedule a 20-minute sync on Thursday at 2 PM to review mockup revisions.">
                Meeting Request
              </button>
              <button type="button" class="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 transition-colors" data-prompt="Politely decline the vendor partnership proposal while leaving the door open for future collaboration.">
                Polite Decline
              </button>
              <button type="button" class="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 transition-colors" data-prompt="Status update: phase 1 deliverables completed on schedule, QA testing underway.">
                Status Update
              </button>
            </div>
          </div>

          <!-- Prompt Input -->
          <div class="space-y-1.5">
            <label for="smart-prompt-input" class="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>What would you like to write?</span>
              <span class="text-[11px] font-normal text-slate-400">Ctrl+Enter to generate</span>
            </label>
            <textarea
              id="smart-prompt-input"
              rows="3"
              placeholder="e.g. Write an email to Sarah thanking her for organizing the demo, and proposing Tuesday at 10 AM to finalize the scope..."
              class="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400 resize-none text-slate-900 dark:text-slate-100 leading-relaxed"
            ></textarea>
          </div>

          <!-- Tone & Length Row -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="smart-tone-select" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Tone
              </label>
              <select id="smart-tone-select" class="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                <option value="Professional" selected>Professional (Balanced)</option>
                <option value="Friendly">Friendly</option>
                <option value="Concise">Concise</option>
                <option value="Urgent">Urgent</option>
                <option value="Formal">Formal</option>
                <option value="Casual">Casual</option>
              </select>
            </div>
            <div>
              <label for="smart-length-select" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Length
              </label>
              <select id="smart-length-select" class="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                <option value="Standard" selected>Standard (2-3 paragraphs)</option>
                <option value="Concise">Short (1-2 sentences)</option>
                <option value="Detailed">Detailed with Action Items</option>
              </select>
            </div>
          </div>

          <!-- Progress / Status bar -->
          <div id="smart-progress-container" class="space-y-1" style="display: none;">
            <div class="flex items-center justify-between text-[11px] text-slate-500">
              <span id="smart-progress-label">Preparing model...</span>
              <span id="smart-progress-val">0%</span>
            </div>
            <div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div id="smart-progress-bar" class="h-full bg-indigo-600 transition-all duration-150" style="width: 0%;"></div>
            </div>
          </div>

          <!-- Generate Button -->
          <button
            type="button"
            id="smart-generate-btn"
            class="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Generate Draft</span>
          </button>

          <!-- Generated Draft Output Area -->
          <div id="smart-draft-container" class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800" style="display: none;">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Generated Draft
              </span>
              <button
                type="button"
                id="smart-copy-btn"
                class="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                Copy to Clipboard
              </button>
            </div>
            <textarea
              id="smart-draft-output"
              rows="6"
              class="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 leading-relaxed font-sans"
            ></textarea>
            <div class="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                id="smart-discard-btn"
                class="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                id="smart-insert-btn"
                class="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>Insert into Email</span>
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      modalEl = overlay;

      const promptInput = overlay.querySelector("#smart-prompt-input");
      const toneSelect = overlay.querySelector("#smart-tone-select");
      const lengthSelect = overlay.querySelector("#smart-length-select");
      const generateBtn = overlay.querySelector("#smart-generate-btn");
      const draftContainer = overlay.querySelector("#smart-draft-container");
      const draftOutput = overlay.querySelector("#smart-draft-output");
      const copyBtn = overlay.querySelector("#smart-copy-btn");
      const insertBtn = overlay.querySelector("#smart-insert-btn");
      const discardBtn = overlay.querySelector("#smart-discard-btn");
      const closeBtn = overlay.querySelector("#smart-modal-close-btn");
      const progressContainer = overlay.querySelector("#smart-progress-container");
      const progressLabel = overlay.querySelector("#smart-progress-label");
      const progressVal = overlay.querySelector("#smart-progress-val");
      const progressBar = overlay.querySelector("#smart-progress-bar");

      if (sdk.config?.default_tone && toneSelect) {
        toneSelect.value = sdk.config.default_tone;
      }
      if (sdk.config?.default_length && lengthSelect) {
        lengthSelect.value = sdk.config.default_length;
      }

      const closeModal = () => {
        overlay.style.display = "none";
      };

      closeBtn.onclick = closeModal;
      discardBtn.onclick = closeModal;

      overlay.onclick = (e) => {
        if (e.target === overlay) {
          closeModal();
        }
      };

      document.addEventListener("keydown", (e) => {
        if (overlay.style.display !== "none" && e.key === "Escape") {
          closeModal();
        }
      });

      // Quick Starter Pills
      const starterBtns = overlay.querySelectorAll("#smart-quick-starters button");
      starterBtns.forEach((b) => {
        b.onclick = () => {
          promptInput.value = b.dataset.prompt;
          promptInput.focus();
        };
      });

      // Generation trigger
      const triggerGeneration = async () => {
        const prompt = promptInput.value.trim();
        if (!prompt) {
          promptInput.focus();
          return;
        }

        generateBtn.disabled = true;
        generateBtn.classList.add("opacity-60", "cursor-not-allowed");
        generateBtn.innerHTML = `
          <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Drafting...</span>
        `;

        try {
          const tone = toneSelect.value;
          const length = lengthSelect.value;
          let generated = "";

          // Attempt Transformers.js if configured or available
          const useNeural = sdk.config?.engine !== "Fast Local WASM";
          let neuralPipe = null;

          if (useNeural) {
            progressContainer.style.display = "block";
            progressLabel.textContent = "Loading local model...";
            neuralPipe = await loadTransformers((pct) => {
              progressLabel.textContent = "Caching local model in browser...";
              progressVal.textContent = `${pct}%`;
              progressBar.style.width = `${pct}%`;
            });
            progressContainer.style.display = "none";
          }

          if (neuralPipe) {
            const lengthGuides = {
              Concise: "Length: Exactly 1 to 2 short sentences. Be brief and to the point. Stop immediately after.",
              Standard: "Length: 2 to 3 standard paragraphs with greeting and signoff.",
              Detailed: "Length: Detailed email with context, bullet points, and next steps.",
            };

            const toneGuides = {
              Professional: "Tone: Professional and courteous.",
              Friendly: "Tone: Warm, friendly, and appreciative.",
              Concise: "Tone: Direct, clear, and brief.",
              Urgent: "Tone: Urgent with immediate call to action.",
              Formal: "Tone: Formal and respectful.",
              Casual: "Tone: Casual, relaxed, and conversational.",
            };

            const messages = [
              {
                role: "system",
                content:
                  "You are an assistant that drafts outgoing emails for the user to send. Output only the email text with a greeting, body, and signoff. Never converse with the user. Never repeat sentences or phrases. Stop immediately once the email is complete.",
              },
              {
                role: "user",
                content: `Email Objective: ${prompt}\n${toneGuides[tone] || ""}\n${lengthGuides[length] || ""}\nWrite the outgoing email:`,
              },
            ];

            const tokenLimits = {
              Concise: 80,
              Standard: 300,
              Detailed: 500,
            };
            const maxTokens = tokenLimits[length] || 300;

            const out = await neuralPipe(messages, {
              max_new_tokens: maxTokens,
              temperature: 0.5,
              top_p: 0.9,
              repetition_penalty: 1.35,
              do_sample: true,
            });

            if (out && out[0] && out[0].generated_text) {
              const res = out[0].generated_text;
              if (Array.isArray(res)) {
                generated = res[res.length - 1].content;
              } else if (typeof res === "string") {
                generated = res;
              }
            }

            // Loop detector: trim if the model ever repeats any sentence or clause
            if (generated) {
              const rawSentences = generated.match(/[^.!?\n]+[.!?\n]*|\S+$/g) || [generated];
              const seen = new Set();
              const deduped = [];
              for (const raw of rawSentences) {
                const s = raw.trim();
                if (!s) continue;
                const normalized = s.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (normalized.length > 5 && seen.has(normalized)) {
                  break; // Repetition loop detected, cut off right here
                }
                seen.add(normalized);
                deduped.push(s);
              }
              generated = deduped.join(" ");
            }
          }

          // If neural generation was skipped or returned empty, use the fast local WASM engine
          if (!generated) {
            generated = await generateWithWasm(prompt, tone, length);
          }

          draftOutput.value = generated.trim();
          draftContainer.style.display = "block";
          draftOutput.focus();
          draftContainer.scrollIntoView({ behavior: "smooth" });
        } catch (err) {
          console.error("[Smart Composer] Generation failed:", err);
          // Fallback to local WASM
          const fallback = await generateWithWasm(prompt, toneSelect.value, lengthSelect.value);
          draftOutput.value = fallback.trim();
          draftContainer.style.display = "block";
        } finally {
          progressContainer.style.display = "none";
          generateBtn.disabled = false;
          generateBtn.classList.remove("opacity-60", "cursor-not-allowed");
          generateBtn.innerHTML = `
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Regenerate Draft</span>
          `;
        }
      };

      generateBtn.onclick = triggerGeneration;

      promptInput.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          triggerGeneration();
        }
      });

      // Copy Button
      copyBtn.onclick = async () => {
        if (draftOutput.value) {
          await navigator.clipboard.writeText(draftOutput.value);
          const orig = copyBtn.textContent;
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = orig;
          }, 1500);
        }
      };

      // Insert Button
      insertBtn.onclick = () => {
        const text = draftOutput.value.trim();
        if (text) {
          sdk.insertComposeText(text);
          closeModal();
        }
      };

      return overlay;
    }

    function openModal() {
      const modal = createModal();
      modal.style.display = "flex";
      const promptInput = modal.querySelector("#smart-prompt-input");
      if (promptInput) {
        setTimeout(() => promptInput.focus(), 50);
      }
    }

    // Register "Smart" Button in compose_actions slot
    sdk.registerSlot("compose_actions", {
      render(container) {
        container.innerHTML = "";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = "Compose email with smart assistant";
        btn.className =
          "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400";
        btn.innerHTML = `
          <svg class="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>Smart</span>
        `;

        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openModal();
        };

        container.appendChild(btn);
      }
    });
  },
};
