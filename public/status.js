export class StatusManager {
  constructor(containerElement) {
    this.container = containerElement;
    this.isError = 'error';
    this.isSuccess = 'success';
  }

  show(message, type = 'success', timeoutMs = 2000) {
    const toast = document.createElement('div');
    toast.classList.add('toast');
    toast.textContent = message;

    if (type === this.isSuccess) {
      toast.classList.add('success');
    } else {
      toast.classList.add('error');
    }

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        this.container.removeChild(toast);
      }, 300); // Match transition duration
    }, timeoutMs);
  }
}