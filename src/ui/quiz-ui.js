// 题库 UI

import { checkAnswer } from './types.js';

/**
 * 创建题库 UI
 */
export function createQuizUi({ container, questions, mistakeBook, progress, onShowLesson }) {
  let currentIndex = 0;
  let userAnswer = null;
  let isAnswered = false;

  const elements = {};

  // 初始化 UI
  function init() {
    container.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-header">
          <div class="progress-bar">
            <span class="progress-text">进度：<span id="quiz-current">0</span> / <span id="quiz-total">0</span></span>
            <span class="accuracy-text">正确率：<span id="quiz-accuracy">0.0</span>%</span>
          </div>
        </div>

        <div class="quiz-content">
          <div class="question-area">
            <div class="question-number" id="question-number"></div>
            <div class="question-prompt" id="question-prompt"></div>
            <div class="question-options" id="question-options"></div>
          </div>

          <div class="quiz-actions">
            <button id="btn-submit" class="btn-primary">提交答案</button>
            <button id="btn-show-lesson" class="btn-secondary" style="display:none;">看演示</button>
            <button id="btn-skip" class="btn-secondary">跳过</button>
          </div>

          <div class="feedback-area" id="feedback-area" style="display:none;">
            <div class="feedback-icon" id="feedback-icon"></div>
            <div class="feedback-text" id="feedback-text"></div>
            <div class="explanation" id="explanation"></div>
            <button id="btn-next" class="btn-primary">下一题</button>
          </div>
        </div>

        <div class="quiz-footer">
          <button id="btn-mistakes" class="btn-text">错题本 (<span id="mistake-count">0</span>)</button>
          <button id="btn-reset" class="btn-text">重新开始</button>
        </div>
      </div>
    `;

    // 缓存元素
    elements.currentText = container.querySelector('#quiz-current');
    elements.totalText = container.querySelector('#quiz-total');
    elements.accuracyText = container.querySelector('#quiz-accuracy');
    elements.questionNumber = container.querySelector('#question-number');
    elements.questionPrompt = container.querySelector('#question-prompt');
    elements.questionOptions = container.querySelector('#question-options');
    elements.btnSubmit = container.querySelector('#btn-submit');
    elements.btnShowLesson = container.querySelector('#btn-show-lesson');
    elements.btnSkip = container.querySelector('#btn-skip');
    elements.feedbackArea = container.querySelector('#feedback-area');
    elements.feedbackIcon = container.querySelector('#feedback-icon');
    elements.feedbackText = container.querySelector('#feedback-text');
    elements.explanation = container.querySelector('#explanation');
    elements.btnNext = container.querySelector('#btn-next');
    elements.btnMistakes = container.querySelector('#btn-mistakes');
    elements.mistakeCount = container.querySelector('#mistake-count');
    elements.btnReset = container.querySelector('#btn-reset');

    // 绑定事件
    elements.btnSubmit.addEventListener('click', handleSubmit);
    elements.btnShowLesson.addEventListener('click', handleShowLesson);
    elements.btnSkip.addEventListener('click', handleSkip);
    elements.btnNext.addEventListener('click', handleNext);
    elements.btnMistakes.addEventListener('click', handleShowMistakes);
    elements.btnReset.addEventListener('click', handleReset);

    // 渲染第一题
    renderQuestion();
    updateProgress();
  }

  // 渲染题目
  function renderQuestion() {
    if (currentIndex >= questions.length) {
      showComplete();
      return;
    }

    const question = questions[currentIndex];
    isAnswered = false;
    userAnswer = null;

    elements.questionNumber.textContent = `Q${currentIndex + 1}. [${getDifficultyLabel(question.difficulty)}]`;
    elements.questionPrompt.textContent = question.prompt;

    // 渲染选项
    elements.questionOptions.innerHTML = '';
    if (question.options) {
      question.options.forEach((opt) => {
        const label = document.createElement('label');
        label.className = 'option-label';
        label.innerHTML = `
          <input type="radio" name="answer" value="${opt.id}">
          <span>${opt.text}</span>
        `;
        label.querySelector('input').addEventListener('change', (e) => {
          userAnswer = e.target.value;
        });
        elements.questionOptions.appendChild(label);
      });
    } else if (question.type === 'fill-blank') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'fill-blank-input';
      input.placeholder = '输入答案';
      input.addEventListener('input', (e) => {
        userAnswer = e.target.value;
      });
      elements.questionOptions.appendChild(input);
    } else if (question.type === 'ordering') {
      const items = question.prompt.match(/\d+\..+/g) || [];
      items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'ordering-item';
        div.draggable = true;
        div.dataset.index = idx + 1;
        div.textContent = item;
        elements.questionOptions.appendChild(div);
      });
      // 简化：用输入框代替拖拽
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'fill-blank-input';
      input.placeholder = '输入顺序（用逗号分隔，如 3,2,1,4）';
      input.addEventListener('input', (e) => {
        userAnswer = e.target.value.split(',').map((n) => parseInt(n.trim()));
      });
      elements.questionOptions.appendChild(input);
    }

    // 显示/隐藏「看演示」按钮
    if (question.relatedLesson && onShowLesson) {
      elements.btnShowLesson.style.display = 'inline-block';
    } else {
      elements.btnShowLesson.style.display = 'none';
    }

    // 重置反馈区
    elements.feedbackArea.style.display = 'none';
    elements.btnSubmit.style.display = 'inline-block';
    elements.btnSkip.style.display = 'inline-block';
  }

  // 提交答案
  function handleSubmit() {
    if (isAnswered || userAnswer === null) return;

    const question = questions[currentIndex];
    const correct = checkAnswer(question, userAnswer);

    isAnswered = true;

    // 记录结果
    mistakeBook.record(question.id, correct);
    progress.record(question, correct);

    // 显示反馈
    elements.feedbackIcon.textContent = correct ? '✅' : '❌';
    elements.feedbackText.textContent = correct ? '正确！' : '错误';
    elements.explanation.textContent = question.explanation;
    elements.feedbackArea.style.display = 'block';
    elements.btnSubmit.style.display = 'none';
    elements.btnSkip.style.display = 'none';

    // 禁用选项
    const inputs = elements.questionOptions.querySelectorAll('input');
    inputs.forEach((input) => (input.disabled = true));

    // 更新进度
    updateProgress();
  }

  // 看演示
  function handleShowLesson() {
    const question = questions[currentIndex];
    if (question.relatedLesson && onShowLesson) {
      onShowLesson(question.relatedLesson);
    }
  }

  // 跳过
  function handleSkip() {
    currentIndex++;
    renderQuestion();
  }

  // 下一题
  function handleNext() {
    currentIndex++;
    renderQuestion();
  }

  // 显示错题本
  function handleShowMistakes() {
    const wrong = mistakeBook.getWrong();
    if (wrong.length === 0) {
      alert('暂无错题');
      return;
    }
    const msg = wrong.map((w) => `${w.id}: 错误 ${w.attempts} 次`).join('\n');
    alert(`错题本：\n${msg}`);
  }

  // 重新开始
  function handleReset() {
    if (confirm('确定重新开始？进度将被清空')) {
      currentIndex = 0;
      progress.reset();
      renderQuestion();
      updateProgress();
    }
  }

  // 更新进度
  function updateProgress() {
    const summary = progress.getSummary();
    elements.currentText.textContent = summary.total;
    elements.totalText.textContent = questions.length;
    elements.accuracyText.textContent = summary.accuracy;
    elements.mistakeCount.textContent = mistakeBook.getWrong().length;
  }

  // 显示完成
  function showComplete() {
    const summary = progress.getSummary();
    container.innerHTML = `
      <div class="quiz-complete">
        <h2>🎉 题目完成</h2>
        <div class="summary">
          <p>总题数：${summary.total}</p>
          <p>正确数：${summary.correct}</p>
          <p>正确率：${summary.accuracy}%</p>
        </div>
        <button id="btn-restart" class="btn-primary">再来一遍</button>
        <button id="btn-export" class="btn-secondary">导出进度</button>
      </div>
    `;

    container.querySelector('#btn-restart').addEventListener('click', () => {
      currentIndex = 0;
      init();
    });

    container.querySelector('#btn-export').addEventListener('click', () => {
      const data = {
        progress: progress.export(),
        mistakes: mistakeBook.export(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz-progress-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // 难度标签
  function getDifficultyLabel(difficulty) {
    const labels = { easy: '简单', medium: '中等', hard: '困难' };
    return labels[difficulty] || difficulty;
  }

  init();

  return {
    getCurrentQuestion: () => questions[currentIndex],
    goToQuestion: (index) => {
      currentIndex = index;
      renderQuestion();
    },
  };
}
