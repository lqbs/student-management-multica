/**
 * 渐进增强脚本：
 * 1. 删除二次确认弹窗（禁用 JS 时退化为 /:id/delete-confirm 确认页）；
 * 2. 成绩表单的学生下拉筛选。
 */
(function () {
  'use strict';

  var modal = document.getElementById('confirm-modal');
  var modalForm = document.getElementById('confirm-modal-form');
  var modalWarning = document.getElementById('confirm-modal-warning');
  var modalTitle = document.getElementById('confirm-modal-title');

  function closeModal() {
    if (modal) {
      modal.hidden = true;
    }
  }

  function openModal(trigger) {
    if (!modal || !modalForm || !modalWarning) {
      return false;
    }
    var url = trigger.getAttribute('data-delete-url');
    if (!url) {
      return false;
    }
    modalForm.setAttribute('action', url);
    modalWarning.textContent = trigger.getAttribute('data-delete-warning') || '该操作不可撤销，是否继续？';
    if (modalTitle) {
      modalTitle.textContent = trigger.getAttribute('data-delete-title') || '确认操作';
    }
    modal.hidden = false;
    var submitButton = document.getElementById('confirm-modal-submit');
    if (submitButton) {
      submitButton.focus();
    }
    return true;
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    var deleteTrigger = target.closest('[data-delete-url]');
    if (deleteTrigger) {
      // 已锁定（禁用态）的按钮不做拦截，由确认页展示拦截原因。
      if (deleteTrigger.getAttribute('aria-disabled') === 'true') {
        return;
      }
      if (openModal(deleteTrigger)) {
        event.preventDefault();
      }
      return;
    }
    if (target.closest('[data-modal-cancel]')) {
      event.preventDefault();
      closeModal();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeModal();
    }
  });

  // 成绩表单：按关键字过滤学生下拉项
  var studentFilter = document.querySelector('[data-student-filter]');
  var studentSelect = document.querySelector('[data-student-select]');
  if (studentFilter && studentSelect) {
    var options = Array.prototype.slice.call(studentSelect.querySelectorAll('option'));
    studentFilter.addEventListener('input', function () {
      var keyword = studentFilter.value.trim().toLowerCase();
      options.forEach(function (option) {
        if (!option.value) {
          option.hidden = false;
          return;
        }
        var matches = keyword === '' || option.textContent.toLowerCase().indexOf(keyword) !== -1;
        option.hidden = !matches;
        if (!matches && option.selected) {
          studentSelect.value = '';
        }
      });
    });
  }
})();
