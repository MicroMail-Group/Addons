export default {
  init(sdk) {
    console.log("[VoiceSearch WASM Addon] Initialized with config:", sdk.config);

    // Register a voice search button in the search_bar_action slot
    sdk.registerSlot("search_bar_action", {
      render(container) {
        container.innerHTML = "";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-lg transition-colors shadow-sm";
        btn.innerHTML = `
          <svg class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <span>Voice Search (WASM)</span>
        `;

        let isListening = false;
        btn.onclick = () => {
          if (!isListening) {
            isListening = true;
            btn.classList.add("ring-2", "ring-emerald-500", "bg-emerald-200", "dark:bg-emerald-900");
            btn.querySelector("span").textContent = "Listening...";

            // Use browser speech recognition or simulated WASM model transcription
            if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
              const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
              const recognition = new SpeechRec();
              recognition.lang = sdk.config.language || "en";
              recognition.interimResults = false;
              recognition.onresult = (evt) => {
                const transcript = evt.results[0][0].transcript;
                sdk.setSearchQuery(transcript);
                isListening = false;
                btn.classList.remove("ring-2", "ring-emerald-500", "bg-emerald-200", "dark:bg-emerald-900");
                btn.querySelector("span").textContent = "Voice Search (WASM)";
              };
              recognition.onerror = () => {
                simulateVoiceResult();
              };
              recognition.start();
            } else {
              simulateVoiceResult();
            }

            function simulateVoiceResult() {
              setTimeout(() => {
                const sampleQueries = ["invoice", "urgent meeting", "flight confirmation", "project update"];
                const pick = sampleQueries[Math.floor(Math.random() * sampleQueries.length)];
                sdk.setSearchQuery(pick);
                isListening = false;
                btn.classList.remove("ring-2", "ring-emerald-500", "bg-emerald-200", "dark:bg-emerald-900");
                btn.querySelector("span").textContent = "Voice Search (WASM)";
              }, 1200);
            }
          }
        };

        container.appendChild(btn);
      }
    });
  }
};
