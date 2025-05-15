const passwordCriteria = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  number: /[0-9]/,
  special: /[!@#$%^&*]/,
};

type PasswordCriteriaKey = keyof typeof passwordCriteria;
const MAX_CRITERIA_POINTS = Object.keys(passwordCriteria).length; // 4

/**
 * Calculates the password strength level (0-5) based on provided criteria.
 * Level 0: Too short or empty
 * Level 1: Meets minimum length
 * Level 2: Min length + 1 criteria met
 * Level 3: Min length + 2 criteria met
 * Level 4: Min length + 3 criteria met
 * Level 5: Min length + 4 criteria met 
 * @param password The password string to evaluate.
 * @returns A number representing the strength level (0-5).
 */
export function calculatePasswordStrength(password: string): number {
  if (!password || password.length < 8) {
    return 0;
  }

  let criteriaMetCount = 0;
  const checks: PasswordCriteriaKey[] = Object.keys(passwordCriteria) as PasswordCriteriaKey[];

  checks.forEach((criteriaKey) => {
    if (passwordCriteria[criteriaKey].test(password)) {
      criteriaMetCount++;
    }
  });

  // Strength levels:
  // 1 point for meeting min length (implicit if > 0)
  // + 1 point for each regex criteria met (max 4)
  // Total levels = 1 (min length) + 4 (criteria) = 5 levels beyond 0
  return 1 + criteriaMetCount; // Level 1 is min length + 0 criteria
}