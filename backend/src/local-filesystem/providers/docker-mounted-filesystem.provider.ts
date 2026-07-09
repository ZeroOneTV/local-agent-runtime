import { Injectable } from '@nestjs/common';
import { NativeFilesystemProvider } from './native-filesystem.provider';

/** Docker-mounted usa os mesmos paths já traduzidos pelo PathResolver. */
@Injectable()
export class DockerMountedFilesystemProvider extends NativeFilesystemProvider {}
