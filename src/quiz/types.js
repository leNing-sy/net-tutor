// 题库类型定义

export const QuestionType = {
  BOOLEAN: 'boolean',
  MULTIPLE_CHOICE: 'multiple-choice',
  FILL_BLANK: 'fill-blank',
  ORDERING: 'ordering',
};

export const Difficulty = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
};

/**
 * 题目对象结构
 * @typedef {Object} Question
 * @property {string} id - 题目 ID
 * @property {string} type - 题型（QuestionType 之一）
 * @property {number} stage - 所属阶段（0-3）
 * @property {string} difficulty - 难度（Difficulty 之一）
 * @property {string} prompt - 题目内容
 * @property {Array<{id: string, text: string, correct: boolean}>} [options] - 选项（单选/判断题）
 * @property {string} [answer] - 答案（填空题）
 * @property {Array<number>} [correctOrder] - 正确顺序（排序题）
 * @property {string} explanation - 解析
 * @property {Object} [relatedLesson] - 关联课程
 * @property {string} relatedLesson.stage - 课程阶段（'stage0', 'stage1', ...）
 * @property {Array<number>} [relatedLesson.eventRange] - 事件范围 [start, end]
 */

/**
 * 验证答案
 */
export function checkAnswer(question, userAnswer) {
  switch (question.type) {
    case QuestionType.BOOLEAN:
    case QuestionType.MULTIPLE_CHOICE:
      return question.options.find((opt) => opt.id === userAnswer)?.correct || false;

    case QuestionType.FILL_BLANK:
      // 去除首尾空格，忽略大小写
      return question.answer.trim().toLowerCase() === userAnswer.trim().toLowerCase();

    case QuestionType.ORDERING:
      // 数组完全相等
      return (
        userAnswer.length === question.correctOrder.length &&
        userAnswer.every((val, idx) => val === question.correctOrder[idx])
      );

    default:
      return false;
  }
}
