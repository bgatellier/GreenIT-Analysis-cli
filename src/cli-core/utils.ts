import ProgressBar from 'progress';

type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

/**
 * Initialize new progress bar
 */
function createProgressBar(options: { ci: boolean }, total: number, progressText: string, defaultText: string) {
    let progressBar;
    if (!options.ci) {
        progressBar = new ProgressBar(
            ` ${progressText}       [:bar] :percent     Remaining: :etas     Time: :elapseds`,
            {
                complete: '=',
                incomplete: ' ',
                width: 40,
                total: total,
            }
        );
        progressBar.tick();
    } else {
        console.log(`${defaultText}`);
    }

    return progressBar;
}

//EcoIndex -> Grade
function getEcoIndexGrade(ecoIndex: number): Grade {
    if (ecoIndex > 75) return 'A';
    if (ecoIndex > 65) return 'B';
    if (ecoIndex > 50) return 'C';
    if (ecoIndex > 35) return 'D';
    if (ecoIndex > 20) return 'E';
    if (ecoIndex > 5) return 'F';
    return 'G';
}

//Grade -> EcoIndex
function getGradeEcoIndex(grade: Grade): number {
    if (grade == 'A') return 75;
    if (grade == 'B') return 65;
    if (grade == 'C') return 50;
    if (grade == 'D') return 35;
    if (grade == 'E') return 20;
    if (grade == 'F') return 5;
    return 0;
}

export {
    createProgressBar,
    getEcoIndexGrade,
    getGradeEcoIndex,
}
