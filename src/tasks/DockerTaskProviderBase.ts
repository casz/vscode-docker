/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CustomExecution, ProviderResult, Task, TaskProvider } from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext, parseError } from 'vscode-azureextensionui';
import { DockerOrchestration } from '../constants';
import { DockerPlatform, getPlatform } from '../debugging/DockerPlatformHelper';
import { DockerBuildTask } from './DockerBuildTaskProvider';
import { DockerPseudoShell } from './DockerPseudoShell';
import { DockerRunTask } from './DockerRunTaskProvider';
import { DockerTaskExecutionContext, DockerTaskProviderName, TaskHelper } from './TaskHelper';

export abstract class DockerTaskProviderBase implements TaskProvider {

    protected constructor(private readonly telemetryName: DockerTaskProviderName, protected readonly helpers: { [key in DockerPlatform]: TaskHelper }) { }

    public provideTasks(token?: CancellationToken): ProviderResult<Task[]> {
        return []; // Intentionally empty, so that resolveTask gets used
    }

    public resolveTask(task: Task, token?: CancellationToken): ProviderResult<Task> {
        return new Task(
            task.definition,
            task.scope,
            task.name,
            task.source,
            new CustomExecution(() => Promise.resolve(new DockerPseudoShell(this, task))),
            task.problemMatchers
        );
    }

    public async executeTask(context: DockerTaskExecutionContext, task: DockerBuildTask | DockerRunTask): Promise<number> {
        try {
            await callWithTelemetryAndErrorHandling(`${this.telemetryName}-execute`, async (actionContext: IActionContext) => {
                actionContext.errorHandling.rethrow = true; // Rethrow to hit the try/catch outside this block

                if (!context.folder) {
                    throw new Error(`Unable to determine task scope to execute ${this.telemetryName} task '${task.name}'. Please open a workspace folder.`);
                }

                context.actionContext = actionContext;
                context.platform = getPlatform(task.definition);

                context.actionContext.telemetry.properties.platform = context.platform;
                context.actionContext.telemetry.properties.orchestration = 'single' as DockerOrchestration; // TODO: docker-compose, when support is added
                return await this.executeTaskInternal(context, task);
            });
        } catch (err) {
            const error = parseError(err);
            return parseInt(error.errorType, 10) || 1;
        }

        return 0;
    }

    protected abstract async executeTaskInternal(context: DockerTaskExecutionContext, task: Task): Promise<void>;

    protected getHelper(platform: DockerPlatform): TaskHelper {
        return this.helpers[platform];
    }
}
