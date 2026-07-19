import {STAGE_DISPLAY_SIZES, STAGE_SIZE_MODES} from '../../../src/lib/layout-constants';
import {resolveStageSizeForAvailableWidth} from '../../../src/lib/screen-utils';

describe('chat-aware stage sizing', () => {
    const editorMinWidth = 480;

    test('keeps the large stage when the editor and stage both fit', () => {
        expect(resolveStageSizeForAvailableWidth(
            STAGE_SIZE_MODES.large,
            editorMinWidth + 498,
            editorMinWidth
        )).toBe(STAGE_DISPLAY_SIZES.large);
    });

    test('uses the constrained stage at the intermediate width', () => {
        expect(resolveStageSizeForAvailableWidth(
            STAGE_SIZE_MODES.large,
            editorMinWidth + 426,
            editorMinWidth
        )).toBe(STAGE_DISPLAY_SIZES.largeConstrained);
    });

    test('uses the small stage when the constrained stage does not fit', () => {
        expect(resolveStageSizeForAvailableWidth(
            STAGE_SIZE_MODES.large,
            editorMinWidth + 425,
            editorMinWidth
        )).toBe(STAGE_DISPLAY_SIZES.small);
    });

    test('respects an explicitly selected small stage', () => {
        expect(resolveStageSizeForAvailableWidth(
            STAGE_SIZE_MODES.small,
            editorMinWidth + 498,
            editorMinWidth
        )).toBe(STAGE_DISPLAY_SIZES.small);
    });

    [
        [1024, STAGE_DISPLAY_SIZES.small],
        [1280, STAGE_DISPLAY_SIZES.large],
        [1440, STAGE_DISPLAY_SIZES.large]
    ].forEach(([viewportWidth, expectedStageSize]) => {
        test(`selects a fitting stage at a ${viewportWidth}px viewport`, () => {
            expect(resolveStageSizeForAvailableWidth(
                STAGE_SIZE_MODES.large,
                viewportWidth - 300,
                editorMinWidth
            )).toBe(expectedStageSize);
        });
    });
});
