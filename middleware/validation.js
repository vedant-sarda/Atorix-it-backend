import { validationResult } from 'express-validator';

export const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const errorMessages = {};
    errors.array().forEach(error => {
      if (!errorMessages[error.param]) {
        errorMessages[error.param] = [];
      }
      errorMessages[error.param].push(error.msg);
    });

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  };
};

export const jobApplicationValidation = [
  
];
