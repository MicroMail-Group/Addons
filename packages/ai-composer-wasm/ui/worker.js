// Web Worker for background client-side neural model inference
// Runs completely off the main UI thread so the browser never freezes

let pipelineInstance = null;
let currentModelId = null;

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === "init") {
    const { modelId } = data;
    if (pipelineInstance && currentModelId === modelId) {
      self.postMessage({ type: "ready" });
      return;
    }

    try {
      const { pipeline, env } = await import(
        /* @vite-ignore */ "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3"
      );

      env.allowLocalModels = false;

      currentModelId = modelId;
      pipelineInstance = await pipeline("text-generation", modelId, {
        dtype: "q4",
        progress_callback: (p) => {
          if (p.status === "progress") {
            self.postMessage({
              type: "progress",
              progress: Math.round(p.progress || 0),
            });
          }
        },
      });

      self.postMessage({ type: "ready" });
    } catch (err) {
      console.error("[Smart Composer Worker] Model loading failed:", err);
      self.postMessage({ type: "error", error: err.message || String(err) });
    }
  }

  if (type === "generate") {
    const { messages, maxTokens, temperature, topP, repetitionPenalty } = data;

    try {
      if (!pipelineInstance) {
        throw new Error("Neural pipeline is not loaded yet.");
      }

      const out = await pipelineInstance(messages, {
        max_new_tokens: maxTokens || 250,
        temperature: temperature ?? 0.5,
        top_p: topP ?? 0.9,
        repetition_penalty: repetitionPenalty ?? 1.35,
        do_sample: true,
      });

      let generated = "";
      if (out && out[0] && out[0].generated_text) {
        const res = out[0].generated_text;
        if (Array.isArray(res)) {
          generated = res[res.length - 1].content;
        } else if (typeof res === "string") {
          generated = res;
        }
      }

      self.postMessage({ type: "done", text: generated });
    } catch (err) {
      console.error("[Smart Composer Worker] Inference failed:", err);
      self.postMessage({ type: "error", error: err.message || String(err) });
    }
  }
};
