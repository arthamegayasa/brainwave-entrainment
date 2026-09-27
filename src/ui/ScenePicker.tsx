import { useId } from "react";
import { DEFAULT_SCENE, PICKABLE_SCENES, SCENE_GROUPS, scenePainting } from "./scenes";

interface ScenePickerProps {
  /** The chosen Scene; undefined while none is, and the default shows. */
  value: string | undefined;
  onChange: (sceneId: string) => void;
}

/**
 * Picks the Scene of Custom Audio (Studio save and publish, Audio Bank edit):
 * painting thumbnails grouped as Nature and Science. Only a Scene the
 * designer picks is stored; until then the default shows checked.
 */
export function ScenePicker({ value, onChange }: ScenePickerProps) {
  const id = useId();
  const checked = value ?? DEFAULT_SCENE;

  return (
    <fieldset className="scene-picker">
      <legend className="scene-picker-legend">Scene</legend>
      {SCENE_GROUPS.map((group) => {
        const scenes = PICKABLE_SCENES.filter((scene) => scene.group === group);
        if (scenes.length === 0) return null;
        return (
          <div key={group} className="scene-picker-group" role="group" aria-labelledby={`${id}-${group}`}>
            <span className="scene-picker-group-name" id={`${id}-${group}`}>
              {group}
            </span>
            <div className="scene-picker-grid">
              {scenes.map((scene) => (
                <label key={scene.id} className="scene-option">
                  <input
                    type="radio"
                    name={id}
                    value={scene.id}
                    checked={checked === scene.id}
                    onChange={() => onChange(scene.id)}
                  />
                  <img src={scenePainting(scene.id, 768)} alt="" loading="lazy" draggable={false} />
                  <span className="scene-option-label">
                    {scene.label}
                    {scene.id === DEFAULT_SCENE && (
                      <>
                        {" "}
                        <span className="scene-option-default">Default</span>
                      </>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
