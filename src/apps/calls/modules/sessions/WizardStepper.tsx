import type { ReactNode } from 'react';
import { Button } from '../../../../components/ui';

export type WizardStep = 0 | 1 | 2;

export type WizardStepperProps = {
  currentStep: WizardStep;
  onStepChange: (step: WizardStep) => void;
  canProceedToStep2: boolean;
  canProceedToStep3: boolean;
  className?: string;
};

type StepDef = {
  id: WizardStep;
  number: string;
  label: string;
  desc: string;
};

const STEPS: readonly StepDef[] = [
  { id: 0, number: '1', label: 'Cibler', desc: 'Filtres & critères' },
  { id: 1, number: '2', label: 'Composer', desc: 'Sélection des contacts' },
  { id: 2, number: '3', label: 'Planifier', desc: 'Nom, date & options' },
];

function StepCheckIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="calls-wizard-step__check-icon"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function StepChevron(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="calls-wizard-stepper__chevron"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function WizardStepper({
  currentStep,
  onStepChange,
  canProceedToStep2,
  canProceedToStep3,
  className = '',
}: WizardStepperProps) {
  const isStepAccessible = (stepId: WizardStep): boolean => {
    if (stepId === 0) return true;
    if (stepId === 1) return canProceedToStep2;
    if (stepId === 2) return canProceedToStep2 && canProceedToStep3;
    return false;
  };

  const isStepCompleted = (stepId: WizardStep): boolean => {
    if (stepId === 0) return canProceedToStep2 && currentStep > 0;
    if (stepId === 1) return canProceedToStep3 && currentStep > 1;
    return false;
  };

  return (
    <nav
      className={['calls-wizard-stepper', className].filter(Boolean).join(' ')}
      aria-label="Étapes de composition de la séance"
    >
      <ol className="calls-wizard-stepper__list">
        {STEPS.map((step, index) => {
          const isActive = currentStep === step.id;
          const isCompleted = isStepCompleted(step.id);
          const accessible = isStepAccessible(step.id);

          const itemClasses = [
            'calls-wizard-step',
            isActive && 'calls-wizard-step--active',
            isCompleted && 'calls-wizard-step--completed',
            !accessible && 'calls-wizard-step--disabled',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li key={step.id} className={itemClasses}>
              <Button
                type="button"
                variant="ghost"
                className="calls-wizard-step__btn"
                onClick={() => accessible && onStepChange(step.id)}
                disabled={!accessible}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`Étape ${step.number}: ${step.label} (${step.desc})`}
              >
                <span className="calls-wizard-step__indicator">
                  {isCompleted ? <StepCheckIcon /> : step.number}
                </span>
                <span className="calls-wizard-step__content">
                  <span className="calls-wizard-step__label">{step.label}</span>
                  <span className="calls-wizard-step__desc">{step.desc}</span>
                </span>
              </Button>
              {index < STEPS.length - 1 && (
                <span className="calls-wizard-stepper__divider" aria-hidden="true">
                  <StepChevron />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="calls-wizard-stepper__mobile" aria-hidden="true">
        <span className="calls-wizard-stepper__mobile-badge">
          {currentStep + 1} / {STEPS.length}
        </span>
        <span className="calls-wizard-stepper__mobile-text">
          {STEPS[currentStep].label}
        </span>
      </div>
    </nav>
  );
}
