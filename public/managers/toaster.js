export class ToastManager {
  constructor(containerElement) {
    this.container = containerElement;
    this.isError = 'error';
    this.isSuccess = 'success';
  }

  show(message, type = 'success', isStatic = false, timeoutMs = 1000) {
    if (timeoutMs < 1) return;

    const toast = document.createElement('div');
    toast.classList.add('toast');
    toast.textContent = message;

    if (type === this.isSuccess) toast.classList.add('success');
    else toast.classList.add('error');

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.addEventListener('click', () => this.hide(toast));
      toast.classList.add('show');
    }, 10);
    
    if (!isStatic) {
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
          this.hide(toast);
        }, 300); // Match transition duration
      }, timeoutMs);
    }
  }

  hide(toast) {
    toast.classList.remove('show');
    setTimeout(() => {
      this.container.removeChild(toast);
    }, 300);
  }

  clear() {
    // use to clear static toast messages
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
  }
}