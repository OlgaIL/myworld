// A slow refresh must not overwrite a newer response, including errors.
export function createLatestLoader(fetchData, onResult, onError) {
  let version = 0;
  let active = true;
  return {
    async refresh() {
      const request = ++version;
      try {
        const result = await fetchData();
        if (active && request === version) onResult(result);
      } catch (error) {
        if (active && request === version) onError(error);
      }
    },
    dispose() { active = false; version++; }
  };
}
