import React, { useState, useEffect } from 'react';
import './QuestionCounter.css';

interface QuestionCounterProps {
  totalQuestions: number;
  timeLimit: number; // in seconds
  onTimeUp: () => void;
  isActive: boolean;
}

export default function QuestionCounter({
  totalQuestions,
  timeLimit,
  onTimeUp,
  isActive,
}: QuestionCounterProps) {
  const [timeRemaining, setTimeRemaining] = useState(timeLimit);
  const [questionsAsked, setQuestionsAsked] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          onTimeUp();
          return timeLimit;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, timeLimit, onTimeUp]);

  const timePercentage = (timeRemaining / timeLimit) * 100;
  const timeColor = timePercentage > 33 ? '#667eea' : timePercentage > 10 ? '#f39c12' : '#e74c3c';

  return (
    <div className="question-counter">
      <div className="counter-display">
        <div className="questions-display">
          <div className="label">Questions Asked</div>
          <div className="count">{questionsAsked}</div>
        </div>

        <div className="timer-display">
          <div className="label">Time Remaining</div>
          <div className="timer">
            <svg viewBox="0 0 100 100" className="timer-circle">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#e0e0e0"
                strokeWidth="2"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={timeColor}
                strokeWidth="2"
                strokeDasharray={`${(timePercentage / 100) * 282.74} 282.74`}
                className="timer-progress"
              />
            </svg>
            <div className="timer-text">{timeRemaining}s</div>
          </div>
        </div>
      </div>

      <div className="counter-info">
        <p>Tap to record each question asked</p>
      </div>
    </div>
  );
}
