import type { PasswordStrength as PWStrength } from '../types/electron'

interface Props {
  strength: PWStrength | null
}

const SEGMENTS = 5

export default function PasswordStrength({ strength }: Props) {
  if (!strength) return null

  return (
    <div className="space-y-1.5">
      {/* Bar */}
      <div className="flex gap-1">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i <= strength.score ? strength.color : 'var(--inactive)'
            }}
          />
        ))}
      </div>

      {/* Label + score */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: strength.color }}>
          {strength.label}
        </span>
        <span className="text-xs text-muted">{strength.score}/4</span>
      </div>

      {/* Feedback */}
      {strength.feedback.length > 0 && (
        <ul className="space-y-0.5">
          {strength.feedback.map((tip, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-secondary">
              <span className="mt-0.5 text-amber-400">•</span>
              {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
