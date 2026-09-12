import type { WorkoutExercise } from '../types'
import { formatLiftLoad } from '../utils/format-lift'
import { estimate1RmFromExercise } from '../utils/one-rep-max'

export function ExerciseLines({
  exercises,
  show1Rm = false,
}: {
  exercises: WorkoutExercise[]
  show1Rm?: boolean
}) {
  if (!exercises.length) return null

  return (
    <ul className="exercise-lines">
      {exercises.map((ex, i) => {
        const est = show1Rm ? estimate1RmFromExercise(ex) : null
        return (
          <li key={`${ex.name}-${i}`}>
            <span className="exercise-name">{ex.name}</span>
            <span className="exercise-load">{formatLiftLoad(ex)}</span>
            {est != null && <span className="exercise-1rm">est. 1RM {est} lb</span>}
          </li>
        )
      })}
    </ul>
  )
}
