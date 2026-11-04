class ActionMapper {
  /**
   * Maps an interpretation reason to a specific learning action.
   */
  static getActionForReason(reason) {
    switch (reason) {
      case 'forgot terminology':
        return {
          type: 'short_refresher',
          message: 'Review terminology.',
          description: 'Short explanation + example.'
        };
      case 'can\'t apply it':
        return {
          type: 'practical_task',
          message: 'Needs practical reinforcement.',
          description: 'A practical task to apply the concept.'
        };
      case 'misconception':
        return {
          type: 'direct_correction',
          message: 'Correct misconception.',
          description: 'Direct and immediate correction of mental model.'
        };
      case 'prerequisite weak':
        return {
          type: 'prerequisite_review',
          message: 'Prerequisite weak.',
          description: 'Send back one step to review prerequisites.'
        };
      case 'sufficient evidence':
        return {
          type: 'proceed',
          message: 'Sufficient evidence to proceed.',
          description: 'Proceed with the next topic.'
        };
      default:
        return {
          type: 'continue',
          message: 'Continue learning.',
          description: 'Proceed as normal.'
        };
    }
  }

  /**
   * Formats the final user-facing message based on the state and reason.
   */
  static formatUserFacingMessage(state, reason) {
    const action = this.getActionForReason(reason);
    
    if (state === 'sufficient' || reason === 'sufficient evidence') {
      return "Sufficient evidence to proceed. Nothing shown.";
    }

    let sentence = "Clear on the idea, but ";
    if (reason === 'forgot terminology') {
      sentence = "Understanding is solid, but the exact terminology was forgotten. Recommended: " + action.description;
    } else if (reason === "can't apply it") {
      sentence = "Clear on the idea, but the practical fix needs reinforcement. Recommended: " + action.description;
    } else if (reason === "misconception") {
      sentence = "There is a misunderstanding in the mental model. Recommended: " + action.description;
    } else if (reason === "prerequisite weak") {
      sentence = "Foundational knowledge needs reinforcement. Recommended: " + action.description;
    } else {
      sentence = "Needs further review. Recommended: continue learning.";
    }

    return {
      sentence,
      action: action.type
    };
  }
}

module.exports = ActionMapper;
