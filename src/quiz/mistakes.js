// 错题本：记录答错的题目，支持重做和清除

/**
 * 创建错题本
 * @returns {object}
 */
export function createMistakeBook() {
  const mistakes = new Map(); // questionId -> { questionId, wrongCount, lastAttempt }

  return {
    /**
     * 记录一次答错
     * @param {string} questionId
     */
    add(questionId) {
      const existing = mistakes.get(questionId);
      if (existing) {
        existing.wrongCount++;
        existing.lastAttempt = Date.now();
      } else {
        mistakes.set(questionId, {
          questionId,
          wrongCount: 1,
          lastAttempt: Date.now(),
        });
      }
    },

    /**
     * 移除一道题（答对后从错题本中删除）
     * @param {string} questionId
     */
    remove(questionId) {
      mistakes.delete(questionId);
    },

    /**
     * 获取所有错题
     * @returns {Array<{questionId:string, wrongCount:number, lastAttempt:number}>}
     */
    getAll() {
      return Array.from(mistakes.values()).sort((a, b) => b.lastAttempt - a.lastAttempt);
    },

    /**
     * 获取错题数量
     * @returns {number}
     */
    count() {
      return mistakes.size;
    },

    /**
     * 检查某题是否在错题本中
     * @param {string} questionId
     * @returns {boolean}
     */
    has(questionId) {
      return mistakes.has(questionId);
    },

    /**
     * 清空错题本
     */
    clear() {
      mistakes.clear();
    },

    /**
     * 导出为 JSON 字符串（用于 localStorage）
     * @returns {string}
     */
    export() {
      return JSON.stringify(Array.from(mistakes.entries()));
    },

    /**
     * 从 JSON 字符串导入（用于 localStorage）
     * @param {string} json
     */
    import(json) {
      try {
        const entries = JSON.parse(json);
        mistakes.clear();
        for (const [id, data] of entries) {
          mistakes.set(id, data);
        }
      } catch (e) {
        console.error('Failed to import mistake book:', e);
      }
    },
  };
}
