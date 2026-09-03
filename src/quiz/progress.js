// 学习进度追踪：记录每道题的答题次数、正确次数、最近一次答题时间

/**
 * 创建进度追踪器
 * @returns {object}
 */
export function createProgress() {
  const records = new Map(); // questionId -> { attempts, correct, lastAttempt }

  return {
    /**
     * 记录一次答题
     * @param {string} questionId
     * @param {boolean} isCorrect
     */
    record(questionId, isCorrect) {
      const existing = records.get(questionId);
      if (existing) {
        existing.attempts++;
        if (isCorrect) existing.correct++;
        existing.lastAttempt = Date.now();
      } else {
        records.set(questionId, {
          attempts: 1,
          correct: isCorrect ? 1 : 0,
          lastAttempt: Date.now(),
        });
      }
    },

    /**
     * 获取某题的进度
     * @param {string} questionId
     * @returns {{attempts:number, correct:number, lastAttempt:number}|null}
     */
    get(questionId) {
      return records.get(questionId) ?? null;
    },

    /**
     * 获取所有进度
     * @returns {Array<{questionId:string, attempts:number, correct:number, lastAttempt:number}>}
     */
    getAll() {
      return Array.from(records.entries()).map(([id, data]) => ({
        questionId: id,
        ...data,
      }));
    },

    /**
     * 获取统计数据
     * @returns {{total:number, attempted:number, mastered:number}}
     */
    getStats(totalQuestions) {
      const attempted = records.size;
      const mastered = Array.from(records.values()).filter(
        (r) => r.correct >= 2 && r.correct / r.attempts >= 0.8
      ).length;
      return { total: totalQuestions, attempted, mastered };
    },

    /**
     * 清空进度
     */
    clear() {
      records.clear();
    },

    /**
     * 导出为 JSON 字符串（用于 localStorage）
     * @returns {string}
     */
    export() {
      return JSON.stringify(Array.from(records.entries()));
    },

    /**
     * 从 JSON 字符串导入（用于 localStorage）
     * @param {string} json
     */
    import(json) {
      try {
        const entries = JSON.parse(json);
        records.clear();
        for (const [id, data] of entries) {
          records.set(id, data);
        }
      } catch (e) {
        console.error('Failed to import progress:', e);
      }
    },
  };
}
