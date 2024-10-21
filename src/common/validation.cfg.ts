import { BadRequestException, ValidationError } from '@nestjs/common';

export function validationCfg() {
  return {
    transform: true,
    validationError: {
      target: false,
    },
    exceptionFactory: (errors: ValidationError[]) => {
      const formatted = errors.map((e) => ({
        property: e.property,
        messages: e.constraints,
      }));

      return new BadRequestException(formatted);
    },
  };
}
