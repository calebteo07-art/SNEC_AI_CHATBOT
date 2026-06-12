interface ExerciseSplitProps {
  imageSrc: string;
  imageAlt?: string;
  children: React.ReactNode;
}

export function ExerciseSplit({ imageSrc, imageAlt = "", children }: ExerciseSplitProps) {
  return (
    <div className="exercise-split">
      <div className="exercise-image-panel">
        <img src={imageSrc} alt={imageAlt} />
        <div className="exercise-image-fade" aria-hidden="true" />
      </div>
      <div className="exercise-question-panel">
        {children}
      </div>
    </div>
  );
}

import type React from "react";
