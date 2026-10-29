import {ComicPipeline} from './comic-post';
import {NaturalPipeline} from './desert-post';
import type {LookId, PipelineContext, PipelineQuality, RenderPipeline} from './render-pipeline';

export type PipelineFactory = (context: PipelineContext, quality: PipelineQuality) => RenderPipeline;

/** Every look by id. A new look adds its id to `LookId` and its factory here. */
export const PIPELINES: Readonly<Record<LookId, PipelineFactory>> = {
  comic: (context, quality) => new ComicPipeline(context, quality),
  natural: (context, quality) => new NaturalPipeline(context, quality),
};

export function createPipeline(look: LookId, context: PipelineContext, quality: PipelineQuality): RenderPipeline {
  return PIPELINES[look](context, quality);
}
