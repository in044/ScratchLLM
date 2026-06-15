import spriteLibraryContent from './libraries/sprites.json';
import randomizeSpritePosition from './randomize-sprite-position';

export const buildSpriteCatalog = () => spriteLibraryContent.map(sprite => ({
    name: sprite.name,
    tags: sprite.tags || []
}));

export const buildProjectAssetSummary = project => ({
    targets: (project.targets || []).map(target => ({
        name: target.isStage ? 'Stage' : target.name,
        costumes: (target.costumes || []).map(costume => costume.name),
        sounds: (target.sounds || []).map(sound => sound.name)
    }))
});

export const findLibrarySprite = name => (
    spriteLibraryContent.find(sprite => sprite.name === name) || null
);

export const addLibrarySprite = (vm, name) => {
    const source = findLibrarySprite(name);
    if (!source) return Promise.resolve(null);

    const sprite = JSON.parse(JSON.stringify(source));
    randomizeSpritePosition(sprite);
    return vm.addSprite(JSON.stringify(sprite)).then(() => (
        vm.editingTarget && typeof vm.editingTarget.getName === 'function' ?
            vm.editingTarget.getName() :
            name
    ));
};
