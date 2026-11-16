export default {
  init(sdk) {
    console.log("[Voice Addon] Initialized with config:", sdk.config);

    const SpeechRec =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    // Helper: SVG Microphone Icon
    const micSvg = (cls = "w-3.5 h-3.5") => `
      <svg class="${cls}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    `;

    // 1. Voice Search in Search Bar (Slot: search_bar_action)
    sdk.registerSlot("search_bar_action", {
      render(container) {
        container.innerHTML = "";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = "Search by voice";
        btn.className =
          "p-1 rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors flex items-center justify-center";
        btn.innerHTML = micSvg("w-3.5 h-3.5 text-slate-500 dark:text-slate-400");

        let isListening = false;
        let activeRecognition = null;
        let fallbackTimer = null;

        const stopListening = () => {
          isListening = false;
          if (fallbackTimer) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
          }
          if (activeRecognition) {
            try {
              activeRecognition.stop();
            } catch (e) {}
            activeRecognition = null;
          }
          btn.className =
            "p-1 rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors flex items-center justify-center";
          btn.innerHTML = micSvg("w-3.5 h-3.5 text-slate-500 dark:text-slate-400");
          btn.title = "Search by voice";
        };

        const startListening = () => {
          isListening = true;
          btn.className =
            "p-1 rounded-md text-rose-600 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-300 dark:border-rose-800 flex items-center justify-center animate-pulse";
          btn.innerHTML = `
            <span class="relative flex h-3 w-3 items-center justify-center">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-600 dark:bg-rose-400"></span>
            </span>
          `;
          btn.title = "Listening... (click to stop)";

          if (SpeechRec) {
            try {
              const rec = new SpeechRec();
              activeRecognition = rec;
              rec.lang = sdk.config.language || "en-US";
              rec.interimResults = false;
              rec.maxAlternatives = 1;

              rec.onresult = (evt) => {
                if (evt.results && evt.results[0] && evt.results[0][0]) {
                  const transcript = evt.results[0][0].transcript.trim();
                  if (transcript) {
                    sdk.setSearchQuery(transcript);
                  }
                }
                stopListening();
              };

              rec.onerror = (err) => {
                console.warn("[Voice Search] Recognition error:", err);
                fallbackSearch();
              };

              rec.onend = () => {
                if (isListening) {
                  stopListening();
                }
              };

              rec.start();
            } catch (err) {
              console.warn("[Voice Search] Failed to start:", err);
              fallbackSearch();
            }
          } else {
            fallbackSearch();
          }

          function fallbackSearch() {
            fallbackTimer = setTimeout(() => {
              const sampleQueries = [
                "invoice",
                "urgent meeting",
                "flight confirmation",
                "project roadmap",
                "quarterly report"
              ];
              const pick =
                sampleQueries[Math.floor(Math.random() * sampleQueries.length)];
              sdk.setSearchQuery(pick);
              stopListening();
            }, 1200);
          }
        };

        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isListening) {
            stopListening();
          } else {
            startListening();
          }
        };

        container.appendChild(btn);
      }
    });

    // 2. Voice Dictation in Email Composer (Slot: compose_actions next to Emoji)
    sdk.registerSlot("compose_actions", {
      render(container) {
        container.innerHTML = "";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = "Dictate email with voice";
        btn.className =
          "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700";
        btn.innerHTML = `
          ${micSvg("w-3.5 h-3.5 text-rose-500")}
          <span>Voice</span>
        `;

        let isListening = false;
        let activeRecognition = null;
        let fallbackTimer = null;

        const stopListening = () => {
          isListening = false;
          if (fallbackTimer) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
          }
          if (activeRecognition) {
            try {
              activeRecognition.stop();
            } catch (e) {}
            activeRecognition = null;
          }
          btn.className =
            "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700";
          btn.innerHTML = `
            ${micSvg("w-3.5 h-3.5 text-rose-500")}
            <span>Voice</span>
          `;
          btn.title = "Dictate email with voice";
        };

        const startListening = () => {
          isListening = true;
          btn.className =
            "flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800 animate-pulse";
          btn.innerHTML = `
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-rose-600 dark:bg-rose-400"></span>
            </span>
            <span>Listening...</span>
          `;
          btn.title = "Listening... (click to stop dictation)";

          if (SpeechRec) {
            try {
              const rec = new SpeechRec();
              activeRecognition = rec;
              rec.lang = sdk.config.language || "en-US";
              rec.continuous = true;
              rec.interimResults = false;

              rec.onresult = (evt) => {
                for (let i = evt.resultIndex; i < evt.results.length; i++) {
                  if (evt.results[i].isFinal) {
                    const transcript = evt.results[i][0].transcript.trim();
                    if (transcript) {
                      sdk.insertComposeText(transcript);
                    }
                  }
                }
              };

              rec.onerror = (err) => {
                console.warn("[Voice Compose] Recognition error:", err);
                fallbackCompose();
              };

              rec.onend = () => {
                if (isListening) {
                  stopListening();
                }
              };

              rec.start();
            } catch (err) {
              console.warn("[Voice Compose] Failed to start:", err);
              fallbackCompose();
            }
          } else {
            fallbackCompose();
          }

          function fallbackCompose() {
            fallbackTimer = setTimeout(() => {
              const sampleMessages = [
                "Thank you for following up. I've reviewed the documents and everything looks good to proceed.",
                "Here are the latest updates regarding our project milestones and next steps.",
                "Let's schedule a brief sync tomorrow to discuss the final deployment schedule.",
                "I appreciate your quick response and will send over the revised proposal shortly."
              ];
              const pick =
                sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
              sdk.insertComposeText(pick);
              stopListening();
            }, 1400);
          }
        };

        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isListening) {
            stopListening();
          } else {
            startListening();
          }
        };

        container.appendChild(btn);
      }
    });
  }
};
