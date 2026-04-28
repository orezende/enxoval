"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnprocessableError = exports.ValidationError = exports.ConflictError = exports.NotFoundError = exports.AppError = void 0;
class AppError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}
exports.AppError = AppError;
class NotFoundError extends AppError {
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
}
exports.ConflictError = ConflictError;
class ValidationError extends AppError {
}
exports.ValidationError = ValidationError;
class UnprocessableError extends AppError {
}
exports.UnprocessableError = UnprocessableError;
//# sourceMappingURL=index.js.map