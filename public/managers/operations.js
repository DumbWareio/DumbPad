// Operation Types
export const OperationType = {
    INSERT: 'insert',
    DELETE: 'delete'
};

export class OperationsManager {
    constructor() {
        this.DEBUG = false;
        this.localVersion = 0;  // Local operation counter
        this.serverVersion = 0; // Last acknowledged server version
        this.pendingOperations = new Map(); // Map of operation ID to operation
        this.nextOperationId = 0;
    }

    // Create an operation object with unique ID
    createOperation(type, position, text = '', userId) {
        const operationId = this.nextOperationId++;
        const operation = {
            id: operationId,
            type,
            position,
            text,
            userId,
            localVersion: this.localVersion++,
            serverVersion: this.serverVersion,
            timestamp: Date.now()
        };
        this.pendingOperations.set(operationId, operation);
        
        if (this.DEBUG) {
            console.log('Created operation:', operation);
        }
        
        return operation;
    }

    // Apply an operation to the text
    applyOperation(operation, text) {
        let result;
        switch (operation.type) {
            case OperationType.INSERT:
                result = text.slice(0, operation.position) + operation.text + text.slice(operation.position);
                break;
            case OperationType.DELETE:
                result = text.slice(0, operation.position) + text.slice(operation.position + operation.text.length);
                break;
            default:
                result = text;
        }
        
        if (this.DEBUG) {
            console.log('Applied operation:', operation, 'Result:', result);
        }
        
        return result;
    }

    // Handle operation acknowledgment
    handleOperationAck(operationId, serverVer) {
        if (this.pendingOperations.has(operationId)) {
            if (this.DEBUG) {
                console.log('Operation acknowledged:', operationId, 'server version:', serverVer);
            }
            const operation = this.pendingOperations.get(operationId);
            operation.serverVersion = serverVer;
            this.pendingOperations.delete(operationId);
            this.serverVersion = Math.max(this.serverVersion, serverVer);
        }
    }

    // Transform operation against another operation with improved handling
    transformOperation(operation, against) {
        if (operation.timestamp < against.timestamp) {
            return operation;
        }

        let newOperation = { ...operation };

        if (against.type === OperationType.INSERT) {
            if (operation.position > against.position) {
                newOperation.position += against.text.length;
            } else if (operation.position === against.position) {
                // For concurrent insertions at the same position,
                // order by user ID to ensure consistency
                if (operation.userId > against.userId) {
                    newOperation.position += against.text.length;
                }
            }
        } else if (against.type === OperationType.DELETE) {
            if (operation.type === OperationType.INSERT) {
                // Handle insert against delete
                if (operation.position >= against.position + against.text.length) {
                    newOperation.position -= against.text.length;
                } else if (operation.position > against.position) {
                    newOperation.position = against.position;
                }
            } else if (operation.type === OperationType.DELETE) {
                // Handle delete against delete
                if (operation.position >= against.position + against.text.length) {
                    newOperation.position -= against.text.length;
                } else if (operation.position + operation.text.length <= against.position) {
                    // No change needed
                } else {
                    // Handle overlapping deletions
                    const overlapStart = Math.max(operation.position, against.position);
                    const overlapEnd = Math.min(
                        operation.position + operation.text.length,
                        against.position + against.text.length
                    );
                    const overlap = overlapEnd - overlapStart;
                    
                    if (operation.position < against.position) {
                        // Our deletion starts before the other deletion
                        newOperation.text = operation.text.slice(0, against.position - operation.position);
                    } else {
                        // Our deletion starts within or after the other deletion
                        newOperation.position = against.position;
                        newOperation.text = operation.text.slice(overlap);
                    }
                    
                    if (newOperation.text.length === 0) {
                        return null; // Operation is no longer needed
                    }
                }
            }
        }

        if (this.DEBUG) {
            console.log('Transformed operation:', operation, 'against:', against, 'result:', newOperation);
        }

        return newOperation;
    }

    // Get all pending operations
    getPendingOperations() {
        return Array.from(this.pendingOperations.values())
            .sort((a, b) => a.timestamp - b.timestamp);
    }

    // Clear all pending operations
    clearPendingOperations() {
        this.pendingOperations.clear();
    }
} 