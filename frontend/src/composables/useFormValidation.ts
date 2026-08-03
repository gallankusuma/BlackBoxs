import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { ZodSchema } from 'zod';

export function useFormValidation<T extends Record<string, any>>(
  validationSchema: ZodSchema,
  onSubmit: (values: T) => Promise<void> | void,
  initialValues?: T
) {
  const { handleSubmit, values, errors, isSubmitting, resetForm, setValues } = useForm({
    validationSchema: toTypedSchema(validationSchema),
    initialValues: initialValues || {},
  });

  const onSubmitHandler = handleSubmit(async (values) => {
    try {
      await onSubmit(values as T);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  });

  return {
    handleSubmit: onSubmitHandler,
    values: values as T,
    errors,
    isSubmitting,
    resetForm,
    setValues,
  };
}
