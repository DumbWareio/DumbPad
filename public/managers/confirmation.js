export default class ConfirmationManager {
  constructor() {}

  // Use to show confirmations when a modal is already open
  async show(message, onConfirm, onCancel) {
    const confirmed = window.confirm(message);
  
    if (confirmed) {
      if (Array.isArray(onConfirm)) { // Check if onConfirm is an array
        for (const func of onConfirm) {
          if (typeof func === 'function') {
            await func(); // Await each function call
          } else {
            console.log('Invalid function in onConfirm array.');
          }
        }
      } else if (typeof onConfirm === 'function') {
        await onConfirm(); // Await single function call
      } else {
        console.log('Confirmed, but no onConfirm function or array provided.');
      }
    } else {
      if (Array.isArray(onCancel)) {
        for (const func of onCancel) {
          if (typeof func === 'function') {
            await func(); // Await each function call
          } else {
            console.log('Invalid function in onCancel array.');
          }
        }
      } else if (typeof onCancel === 'function') {
        await onCancel(); // Await single function call
      } else {
        console.log('Cancelled, but no onCancel function or array provided.');
      }
    }

    return confirmed;
  }
}